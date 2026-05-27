/**
 * backend/server.js — API de Leads + Disparo Batch Persistente
 *
 * Responsabilidades:
 *   - Ponte entre o frontend e o PostgreSQL VPS (leads pool)
 *   - Gerenciamento de fila de disparo persistente (disparo_sessions + disparo_items)
 *     O disparo roda no servidor: fechar o browser não interrompe o processo.
 *
 * Dev:  node server.js           (ou: npm start)
 * PRD:  variáveis via process.env (EasyPanel dashboard)
 */

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pg from 'pg';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import cnpjaPkg from '@cnpja/sdk';

const { Cnpja } = cnpjaPkg;
const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Configuração ─────────────────────────────────────────────────────────────
function loadEnv() {
  const env = {};

  // Carrega root .env como base (VITE_* e outras variáveis compartilhadas)
  const rootPath = resolve(__dirname, '../.env');
  if (existsSync(rootPath)) {
    for (const line of readFileSync(rootPath, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
    }
  }

  // Carrega backend/.env por cima (maior prioridade — sobrescreve root)
  const backendPath = resolve(__dirname, '.env');
  if (existsSync(backendPath)) {
    for (const line of readFileSync(backendPath, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
    }
  }

  return env;
}
const ENV = loadEnv();
const cfg = (k) => process.env[k] ?? ENV[k];

// ─── N8N Webhook (lê backend/.env; fallback para VITE_ do root .env) ──────────
const N8N_WEBHOOK_URL    = cfg('N8N_WEBHOOK_URL')    || cfg('VITE_N8N_WEBHOOK_URL');
const N8N_WEBHOOK_SECRET = cfg('N8N_WEBHOOK_SECRET') || cfg('VITE_N8N_WEBHOOK_SECRET');

const API_KEYS = [
  cfg('CNPJA_API_KEY_1'),
  cfg('CNPJA_API_KEY_2'),
  cfg('CNPJA_API_KEY_3'),
  cfg('CNPJA_API_KEY_4'),
].filter(Boolean);

const db = new Pool({
  host:     cfg('PG_HOST'),
  port:     parseInt(cfg('PG_PORT') || '5432'),
  user:     cfg('PG_USER'),
  password: cfg('PG_PASSWORD'),
  database: cfg('PG_DATABASE'),
  ssl:      false,
});

// ─── App ──────────────────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1);

// CORS
const ALLOWED_ORIGINS = (cfg('ALLOWED_ORIGINS') || 'http://localhost:8080')
  .split(',')
  .map((s) => s.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('CORS: origem não permitida'));
  },
  allowedHeaders: ['Content-Type', 'x-api-key'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  preflightContinue: false,
  optionsSuccessStatus: 200,
}));

// Rate limit — 100 req/min por IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em 1 minuto.' },
});
app.use('/api', limiter);

// API Key — aceita via header x-api-key ou query param ?apikey=
const BACKEND_API_KEY = cfg('BACKEND_API_KEY');
app.use('/api', (req, res, next) => {
  if (!BACKEND_API_KEY) return next();
  const key = req.headers['x-api-key'] || req.query.apikey;
  if (key !== BACKEND_API_KEY) return res.status(401).json({ error: 'Não autorizado.' });
  next();
});

app.use(express.json({ limit: '5mb' })); // batch pode ter muitos contatos

// ─── Helpers gerais ───────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── Validação / normalização de telefone brasileiro ─────────────────────────
/**
 * Mapa UF → DDDs válidos (fonte: ANATEL).
 * Usado para:
 *  1. Inferir DDD quando o número não o contém
 *  2. Alertar quando o DDD informado não pertence ao estado da empresa
 */
const DDD_POR_ESTADO = {
  AC: [68],
  AL: [82],
  AM: [92, 97],
  AP: [96],
  BA: [71, 73, 74, 75, 77],
  CE: [85, 88],
  DF: [61],
  ES: [27, 28],
  GO: [62, 64],
  MA: [98, 99],
  MG: [31, 32, 33, 34, 35, 37, 38],
  MS: [67],
  MT: [65, 66],
  PA: [91, 93, 94],
  PB: [83],
  PE: [81, 87],
  PI: [86, 89],
  PR: [41, 42, 43, 44, 45, 46],
  RJ: [21, 22, 24],
  RN: [84],
  RO: [69],
  RR: [95],
  RS: [51, 53, 54, 55],
  SC: [47, 48, 49],
  SE: [79],
  SP: [11, 12, 13, 14, 15, 16, 17, 18, 19],
  TO: [63],
};

/** Conjunto de todos os DDDs válidos do Brasil para consulta rápida */
const ALL_VALID_DDDS = new Set(Object.values(DDD_POR_ESTADO).flat());

/**
 * Normaliza um número de telefone brasileiro para o formato somente-dígitos
 * 55DDXXXXXXXX (12) ou 55DDXXXXXXXXX (13) — pronto para WhatsApp / N8N.
 *
 * Regras (em ordem de aplicação):
 *  1. Remove todos os caracteres não-numéricos
 *  2. Remove prefixo "55" se o restante tiver 8–11 dígitos (DDD+local ou só local)
 *  3. Remove "0" inicial (discagem nacional antiga: 011...)
 *  4. Com DDD explícito (10–11 dígitos): valida o DDD; alerta se diferente do estado
 *  5. Sem DDD (8–9 dígitos): insere o DDD primário do estado — obrigatório ter `estado`
 *  6. Valida comprimento do número local: 8 (fixo) ou 9 (celular)
 *
 * Exemplos de entrada aceita:
 *   "(11) 99999-9999"  → "5511999999999"
 *   "11 9999-9999"     → "551199999999"
 *   "5511999999999"    → "5511999999999"  (já correto)
 *   "55999999999"      → "5511999999999"  (55 sem DDD + estado SP)
 *   "999999999"        → "5511999999999"  (sem prefixo + estado SP)
 *
 * @param {string|null} rawPhone  Número bruto (qualquer máscara)
 * @param {string|null} estado    Sigla do estado ('SP', 'RJ'…) — obrigatório quando DDD ausente
 * @returns {{ normalized: string, warning: string|null } | null}
 *   null   = número inválido (deve ser descartado / marcado como erro)
 *   objeto = { normalized: '5511999999999', warning: null | '<aviso>' }
 */
function normalizePhone(rawPhone, estado) {
  if (!rawPhone) return null;

  let d = String(rawPhone).replace(/\D/g, '');
  if (!d) return null;

  const uf        = estado ? String(estado).toUpperCase().trim() : null;
  const stateDDDs = uf ? (DDD_POR_ESTADO[uf] ?? []) : [];
  let warning     = null;

  // Passo 1 — Remove prefixo de país "55"
  // Só remove se o restante tiver entre 8 e 11 dígitos (formatos válidos pós-remoção).
  // Isso cobre o caso em que o "55" está presente mas o DDD está faltando:
  //   ex.: "55999999999" (11 chars) → remove 55 → "999999999" (9) → DDD inferido pelo estado
  if (d.startsWith('55')) {
    const rest = d.slice(2);
    if (rest.length >= 8 && rest.length <= 11) {
      d = rest;
    }
    // Se rest.length < 8 ou > 11, mantém d original — vai falhar na validação abaixo
  }

  // Passo 2 — Remove "0" inicial (discagem nacional: 011XXXXXXXX → 11XXXXXXXX)
  if (d.startsWith('0') && d.length >= 11) {
    d = d.slice(1);
  }

  // Passo 3 — Separar DDD e número local
  let ddd, local;

  if (d.length >= 10 && d.length <= 11) {
    // Tem DDD explícito (2 dígitos) + número local (8 ou 9 dígitos)
    ddd   = parseInt(d.slice(0, 2), 10);
    local = d.slice(2);
  } else if (d.length === 8 || d.length === 9) {
    // Sem DDD — inferir pelo estado da empresa
    if (stateDDDs.length === 0) return null; // sem estado → não é possível inferir
    ddd     = stateDDDs[0];
    local   = d;
    warning = `DDD ausente; inferido ${ddd} (${uf})`;
  } else {
    return null; // comprimento inválido
  }

  // Passo 4 — Validar DDD
  if (!ALL_VALID_DDDS.has(ddd)) return null;

  // Passo 5 — Alertar (sem descartar) se DDD não pertence ao estado informado
  if (uf && stateDDDs.length > 0 && !stateDDDs.includes(ddd)) {
    warning = `DDD ${ddd} não pertence ao estado ${uf} (DDDs esperados: ${stateDDDs.join('/')})`;
  }

  // Passo 6 — Validar comprimento do número local: 8 = fixo, 9 = celular
  if (local.length < 8 || local.length > 9) return null;

  return { normalized: `55${ddd}${local}`, warning };
}

async function checkCredits(apiKey) {
  try {
    const sdk = new Cnpja({ apiKey });
    const c = await sdk.credit.read();
    return (c.perpetual ?? 0) + (c.transient ?? 0);
  } catch {
    return 0;
  }
}

async function getActiveKey() {
  for (let i = 0; i < API_KEYS.length; i++) {
    const credits = await checkCredits(API_KEYS[i]);
    if (credits > 0) return { key: API_KEYS[i], index: i + 1, credits };
  }
  return null;
}

async function saveOffice(office) {
  const address = office.address ?? {};
  const phones = office.phones ?? [];
  const emails = office.emails ?? [];
  const mainActivity = office.mainActivity ?? {};
  const sideActivities = office.sideActivities ?? [];
  const company_ = office.company ?? {};

  const cnpj = (office.taxId ?? '').replace(/\D/g, '');
  if (!cnpj || cnpj.length !== 14) return false;
  if (office.status?.id !== 2) return false;

  // Normaliza e valida telefones usando o estado da empresa para inferir DDD ausente
  const tel1Result = normalizePhone(phones[0]?.number, address.state);
  const tel2Result = normalizePhone(phones[1]?.number, address.state);
  if (tel1Result?.warning) console.log(`[leads] tel1 normalizado (${cnpj}): ${tel1Result.warning}`);
  if (tel2Result?.warning) console.log(`[leads] tel2 normalizado (${cnpj}): ${tel2Result.warning}`);
  if (!tel1Result && phones[0]?.number) console.log(`[leads] tel1 inválido descartado (${cnpj}): "${phones[0].number}"`);
  if (!tel2Result && phones[1]?.number) console.log(`[leads] tel2 inválido descartado (${cnpj}): "${phones[1].number}"`);

  const { rowCount } = await db.query(
    `INSERT INTO blitzar_leads_pool
      (cnpj, razao_social, nome_fantasia, data_abertura, eh_matriz,
       natureza_juridica, porte, capital_social, simples_nacional, mei,
       cnae_principal_codigo, cnae_principal_texto, cnaes_secundarios,
       telefone, telefone_secundario, email,
       logradouro, numero, complemento, bairro, cidade, estado, cep,
       segmento, fonte, dados_brutos)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
     ON CONFLICT (cnpj) DO NOTHING`,
    [
      cnpj,
      company_.name ?? null,
      office.alias ?? null,
      office.founded ?? null,
      office.head ?? true,
      company_.nature?.text ?? null,
      company_.size?.text ?? null,
      company_.equity ?? null,
      company_.simples?.optant ?? false,
      company_.simei?.optant ?? false,
      mainActivity.id ?? null,
      mainActivity.text ?? null,
      JSON.stringify(sideActivities),
      tel1Result?.normalized ?? null,
      tel2Result?.normalized ?? null,
      emails[0]?.address ?? null,
      address.street ?? null,
      address.number ?? null,
      address.details ?? null,
      address.district ?? null,
      address.city ?? null,
      address.state ?? null,
      (address.zip ?? '').replace(/\D/g, '') || null,
      mainActivity.text ?? null,
      'cnpja',
      JSON.stringify(office),
    ]
  );
  return rowCount > 0;
}

// ─── Fila de Disparo Batch ────────────────────────────────────────────────────
/**
 * Map de abort controllers por sessionId.
 * Permite cancelar uma sessão em andamento via POST /api/disparo/:id/cancel.
 */
const activeSessions = new Map(); // sessionId (string) → { aborted: boolean }

/**
 * Processa uma sessão de disparo de forma assíncrona (não-bloqueante).
 * Chamado no POST /start e no startup (recovery de sessões interrompidas).
 */
async function processDisparoSession(sessionId, instanceName) {
  const ctrl = { aborted: false };
  activeSessions.set(sessionId, ctrl);

  // Busca user_id e mensagem_base da sessão para gravação no log
  const { rows: [sessionMeta] } = await db.query(
    `SELECT user_id, mensagem_base FROM disparo_sessions WHERE id = $1`,
    [sessionId]
  );
  const sessionUserId   = sessionMeta?.user_id       ?? null;
  const sessionMsgBase  = sessionMeta?.mensagem_base ?? '';

  try {
    while (!ctrl.aborted) {
      // Pega o próximo item pendente, em ordem
      const { rows } = await db.query(
        `SELECT * FROM disparo_items
         WHERE session_id = $1 AND status = 'pending'
         ORDER BY position
         LIMIT 1`,
        [sessionId]
      );

      if (!rows.length) break; // fila vazia — sessão concluída

      const item = rows[0];

      // Marca como "enviando" para evitar reprocessamento em caso de crash parcial
      await db.query(
        `UPDATE disparo_items SET status = 'sending' WHERE id = $1`,
        [item.id]
      );

      try {
        if (!N8N_WEBHOOK_URL) throw new Error('N8N_WEBHOOK_URL não configurada no backend.');

        const headers = { 'Content-Type': 'application/json' };
        if (N8N_WEBHOOK_SECRET) headers['x-webhook-secret'] = N8N_WEBHOOK_SECRET;

        // Timeout de 30s para o N8N responder (agora que os Waits foram removidos do fluxo,
        // o N8N só envia a mensagem e responde — deve concluir em poucos segundos).
        const signal = AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined;

        const resp = await fetch(N8N_WEBHOOK_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            Empresa:      item.empresa,
            Telefone:     item.telefone,
            Mensagem:     item.mensagem,
            instanceName: instanceName,
            intervalo_ms: item.intervalo_ms, // intervalo do frontend — usado como 1º wait no n8n
          }),
          ...(signal ? { signal } : {}),
        });

        if (!resp.ok) {
          const body = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status}: ${body}`);
        }

        await db.query(
          `UPDATE disparo_items SET status = 'sent', sent_at = NOW() WHERE id = $1`,
          [item.id]
        );
        await db.query(
          `UPDATE disparo_sessions SET sent = sent + 1, updated_at = NOW() WHERE id = $1`,
          [sessionId]
        );

        // Atualiza blitzar_leads (se lead vier do pool) e grava SEMPRE no dispatch_log
        if (sessionUserId) {
          try {
            const telNorm = String(item.telefone).replace(/\D/g, '');

            // Tenta localizar o lead no pool para enriquecer o log (lead_id, cnpj)
            const { rows: poolRows } = await db.query(
              `SELECT bp.cnpj, bl.id AS lead_id
               FROM blitzar_leads_pool bp
               LEFT JOIN blitzar_leads bl
                      ON bl.pool_lead_id = bp.id AND bl.user_id = $1
               WHERE regexp_replace(COALESCE(bp.telefone,           ''), '\\D','','g') = $2
                  OR regexp_replace(COALESCE(bp.telefone_secundario,''), '\\D','','g') = $2
               LIMIT 1`,
              [sessionUserId, telNorm]
            );
            const poolRow = poolRows[0] || null;

            // Atualiza blitzar_leads somente se o lead estiver no pool
            if (poolRow?.lead_id) {
              await db.query(
                `UPDATE blitzar_leads
                 SET status_lead         = 'contactado',
                     ultimo_disparo_at   = NOW(),
                     quantidade_disparos = quantidade_disparos + 1,
                     ultima_mensagem     = $2,
                     updated_at          = NOW()
                 WHERE id = $1`,
                [poolRow.lead_id, item.mensagem]
              );
            }

            // SEMPRE grava no dispatch_log (lead_id e cnpj ficam NULL se não estiver no pool)
            await db.query(
              `INSERT INTO blitzar_dispatch_log
                 (user_id, lead_id, empresa, cnpj, telefone, mensagem_base, mensagem_ia, instance_name, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'success')`,
              [sessionUserId, poolRow?.lead_id || null, item.empresa, poolRow?.cnpj || null,
               item.telefone, sessionMsgBase, item.mensagem, instanceName]
            );
          } catch (logErr) {
            console.warn(`[disparo] Falha ao gravar log (telefone ${item.telefone}):`, logErr.message);
          }
        }
      } catch (err) {
        const errMsg = String(err.message).slice(0, 500);
        await db.query(
          `UPDATE disparo_items SET status = 'error', error_message = $2 WHERE id = $1`,
          [item.id, errMsg]
        );
        await db.query(
          `UPDATE disparo_sessions SET errors = errors + 1, updated_at = NOW() WHERE id = $1`,
          [sessionId]
        );
        // Loga o erro no dispatch_log para aparecer no histórico
        if (sessionUserId) {
          db.query(
            `INSERT INTO blitzar_dispatch_log
               (user_id, empresa, telefone, mensagem_base, mensagem_ia, instance_name, status, error_message)
             VALUES ($1, $2, $3, $4, $5, $6, 'error', $7)`,
            [sessionUserId, item.empresa, item.telefone, sessionMsgBase, item.mensagem, instanceName, errMsg]
          ).catch(() => {});

          // Upsert em blitzar_leads: cria a linha se não existir e marca como 'erro'
          // Isso remove o lead da tela de Coletar Leads para esse usuário
          const telNormErr = String(item.telefone).replace(/\D/g, '');
          db.query(
            `INSERT INTO blitzar_leads (user_id, pool_lead_id, status_lead, notas, updated_at)
             SELECT $1, bp.id, 'erro', $3, NOW()
             FROM blitzar_leads_pool bp
             WHERE regexp_replace(COALESCE(bp.telefone,           ''), '\\D','','g') = $2
                OR regexp_replace(COALESCE(bp.telefone_secundario,''), '\\D','','g') = $2
             LIMIT 1
             ON CONFLICT (user_id, pool_lead_id)
             DO UPDATE SET status_lead = 'erro',
                           notas       = EXCLUDED.notas,
                           updated_at  = NOW()`,
            [sessionUserId, telNormErr, `Erro no disparo: ${errMsg}`]
          ).catch(() => {});
        }
      }

      // Intervalo entre mensagens gerenciado aqui (Wait nodes removidos do N8N).
      // intervalo_ms já é aleatório por contato (gerado no frontend pelo usuário).
      if (!ctrl.aborted) {
        await sleep(item.intervalo_ms);
      }
    }
  } catch (fatalErr) {
    console.error(`[disparo] Erro fatal na sessão ${sessionId}:`, fatalErr);
    await db.query(
      `UPDATE disparo_sessions SET status = 'failed', updated_at = NOW() WHERE id = $1`,
      [sessionId]
    ).catch(() => {});
    activeSessions.delete(sessionId);
    return;
  }

  const finalStatus = ctrl.aborted ? 'cancelled' : 'completed';
  await db.query(
    `UPDATE disparo_sessions SET status = $2, updated_at = NOW() WHERE id = $1`,
    [sessionId, finalStatus]
  ).catch(() => {});

  activeSessions.delete(sessionId);
  console.log(`[disparo] Sessão ${sessionId} finalizada: ${finalStatus}`);
}

/**
 * Retoma sessões que estavam em execução antes de um restart do servidor.
 * Items em status 'sending' são resetados para 'pending' (envio pode ter sido
 * interrompido no meio) antes de retomar o loop.
 */
async function resumePendingSessions() {
  try {
    // Reset de itens que ficaram presos em 'sending' no crash
    await db.query(
      `UPDATE disparo_items SET status = 'pending' WHERE status = 'sending'`
    );

    const { rows } = await db.query(
      `SELECT id, instance_name FROM disparo_sessions WHERE status = 'running'`
    );

    if (rows.length > 0) {
      console.log(`[disparo] Retomando ${rows.length} sessão(ões) pendente(s)...`);
      for (const session of rows) {
        processDisparoSession(session.id, session.instance_name).catch(console.error);
      }
    }
  } catch (err) {
    console.error('[disparo] Erro ao retomar sessões pendentes:', err);
  }
}

// ─── GET /api/dispatch/history ───────────────────────────────────────────────
/**
 * Retorna o histórico de disparos do usuário a partir de blitzar_dispatch_log (VPS).
 * Query params: user_id (obrigatório), limit (default 500)
 */
app.get('/api/dispatch/history', async (req, res) => {
  const { user_id, limit = 500 } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' });

  const { rows } = await db.query(
    `SELECT id, empresa, cnpj, telefone, mensagem_base, mensagem_ia,
            instance_name, status, error_message, created_at
     FROM blitzar_dispatch_log
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [user_id, Math.min(Number(limit), 1000)]
  );
  res.json(rows);
});

// ─── GET /api/leads/credits ───────────────────────────────────────────────────
app.get('/api/leads/credits', async (_req, res) => {
  const results = [];
  let total = 0;
  for (let i = 0; i < API_KEYS.length; i++) {
    const credits = await checkCredits(API_KEYS[i]);
    total += credits;
    results.push({ index: i + 1, credits, key_hint: API_KEYS[i].slice(0, 8) + '...' });
  }
  res.json({ keys: results, total });
});

// ─── GET /api/leads/stats ─────────────────────────────────────────────────────
app.get('/api/leads/stats', async (_req, res) => {
  const { rows: [s] } = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM blitzar_leads_pool)    AS pool_total,
      (SELECT COUNT(*) FROM blitzar_leads_pool WHERE created_at > NOW() - INTERVAL '24 hours') AS adicionados_hoje,
      (SELECT COUNT(DISTINCT estado) FROM blitzar_leads_pool) AS estados,
      (SELECT COUNT(DISTINCT cnae_principal_codigo) FROM blitzar_leads_pool) AS segmentos
  `);
  res.json(s);
});

// ─── GET /api/leads/pool/select ──────────────────────────────────────────────
// Retorna {id, empresa, telefone} de até `limit` leads com os filtros ativos.
// Usado pelo botão "Selecionar 50/100/200/Todos" do frontend.
// Query params: estado, cnae, search, user_id, limit (máx 500)
app.get('/api/leads/pool/select', async (req, res) => {
  const { estado, cnae, search, user_id, limit = 50 } = req.query;
  const cap = Math.min(parseInt(String(limit)) || 50, 500);

  const conditions = [];
  const params = [];

  if (estado) { params.push(estado);                 conditions.push(`blp.estado = $${params.length}`); }
  if (cnae)   { params.push(parseInt(String(cnae))); conditions.push(`blp.cnae_principal_codigo = $${params.length}`); }
  if (search) {
    params.push(`%${search}%`);
    const n = params.length;
    conditions.push(`(blp.razao_social ILIKE $${n} OR blp.nome_fantasia ILIKE $${n} OR blp.cnpj ILIKE $${n})`);
  }

  let joinClause = '';
  if (user_id) {
    params.push(user_id);
    joinClause = `LEFT JOIN blitzar_leads bl ON bl.pool_lead_id = blp.id AND bl.user_id = $${params.length}`;
    conditions.push(`(bl.status_lead IS NULL OR bl.status_lead != 'erro')`);
  }

  // Só retorna leads que têm telefone (necessário para disparar)
  conditions.push(`blp.telefone IS NOT NULL`);

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(cap);

  const { rows } = await db.query(
    `SELECT blp.id,
            COALESCE(blp.nome_fantasia, blp.razao_social) AS empresa,
            blp.telefone
     FROM blitzar_leads_pool blp
     ${joinClause}
     ${where}
     ORDER BY blp.created_at DESC
     LIMIT $${params.length}`,
    params
  );

  res.json({ leads: rows, total: rows.length });
});

// ─── GET /api/leads/pool ──────────────────────────────────────────────────────
// Query params: estado, cnae, cidade, search, limit, offset, user_id
// Quando user_id fornecido: exclui leads com status_lead='erro' para aquele usuário
//                           e retorna status_lead de cada lead.
app.get('/api/leads/pool', async (req, res) => {
  const { estado, cnae, cidade, search, limit = 50, offset = 0, user_id } = req.query;

  const conditions = [];
  const params = [];

  if (estado) { params.push(estado);                    conditions.push(`blp.estado = $${params.length}`); }
  if (cnae)   { params.push(parseInt(String(cnae)));    conditions.push(`blp.cnae_principal_codigo = $${params.length}`); }
  if (cidade) { params.push(`%${cidade}%`);             conditions.push(`blp.cidade ILIKE $${params.length}`); }
  if (search) {
    params.push(`%${search}%`);
    const n = params.length;
    conditions.push(`(blp.razao_social ILIKE $${n} OR blp.nome_fantasia ILIKE $${n} OR blp.cnpj ILIKE $${n})`);
  }

  // Quando user_id fornecido, exclui leads com erro para esse usuário
  let joinClause = '';
  if (user_id) {
    params.push(user_id);
    joinClause = `LEFT JOIN blitzar_leads bl ON bl.pool_lead_id = blp.id AND bl.user_id = $${params.length}`;
    conditions.push(`(bl.status_lead IS NULL OR bl.status_lead != 'erro')`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const dataParams = [...params, parseInt(String(limit)), parseInt(String(offset))];
  const statusSelect = user_id ? ', bl.status_lead' : ', NULL::varchar AS status_lead';
  const { rows } = await db.query(
    `SELECT blp.id, blp.cnpj, blp.razao_social, blp.nome_fantasia, blp.data_abertura, blp.porte,
            blp.cnae_principal_codigo, blp.cnae_principal_texto, blp.segmento,
            blp.telefone, blp.telefone_secundario, blp.email,
            blp.cidade, blp.estado, blp.cep, blp.simples_nacional, blp.mei, blp.created_at
            ${statusSelect}
     FROM blitzar_leads_pool blp
     ${joinClause}
     ${where}
     ORDER BY blp.created_at DESC
     LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
    dataParams
  );

  const { rows: [{ total }] } = await db.query(
    `SELECT COUNT(*) AS total
     FROM blitzar_leads_pool blp
     ${joinClause}
     ${where}`,
    params
  );

  res.json({ leads: rows, total: parseInt(String(total)) });
});

// ─── POST /api/leads/fetch ────────────────────────────────────────────────────
// Busca empresas no CNPJA e salva no pool. Usa SSE para progresso em tempo real.
app.post('/api/leads/fetch', async (req, res) => {
  const { estado, cnae, limite = 20 } = req.body;

  if (!estado || !cnae) {
    return res.status(400).json({ error: 'estado e cnae são obrigatórios' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  send({ type: 'start', message: 'Verificando créditos...' });

  const keyInfo = await getActiveKey();
  if (!keyInfo) {
    send({ type: 'error', message: 'Todas as chaves CNPJA estão sem créditos.' });
    return res.end();
  }

  send({ type: 'key', message: `Usando Chave ${keyInfo.index} (${keyInfo.credits} créditos)` });

  const sdk = new Cnpja({ apiKey: keyInfo.key });
  let saved = 0;
  let skipped = 0;

  try {
    for await (const page of sdk.office.search({
      'status.id.in': [2],
      'address.state.in': [estado],
      'mainActivity.id.in': [parseInt(String(cnae))],
    })) {
      for (const office of page) {
        if (saved >= parseInt(String(limite))) break;
        try {
          const ok = await saveOffice(office);
          if (ok) {
            saved++;
            send({ type: 'progress', saved, total: parseInt(String(limite)), nome: office.company?.name ?? '' });
          } else {
            skipped++;
          }
        } catch (e) {
          if (e?.message?.includes('credit') || e?.status === 429) {
            send({ type: 'key_exhausted', message: `Chave ${keyInfo.index} esgotou os créditos.` });
            break;
          }
          skipped++;
        }
      }
      if (saved >= parseInt(String(limite))) break;
    }
  } catch (e) {
    send({ type: 'error', message: e.message });
  }

  const updatedCredits = [];
  let totalCredits = 0;
  for (let i = 0; i < API_KEYS.length; i++) {
    const c = await checkCredits(API_KEYS[i]);
    totalCredits += c;
    updatedCredits.push({ index: i + 1, credits: c });
  }

  send({ type: 'done', saved, skipped, credits: updatedCredits, totalCredits });
  res.end();
});

// ─── POST /api/disparo/start ──────────────────────────────────────────────────
/**
 * Inicia um batch de disparo persistente.
 * Body: { user_id, instance_name, mensagem_base, contacts: [{empresa, telefone, mensagem, intervalo_ms}] }
 * Resposta: { session_id, total }
 */
app.post('/api/disparo/start', async (req, res) => {
  const { user_id, instance_name, mensagem_base, contacts } = req.body;

  if (!user_id || !instance_name || !Array.isArray(contacts) || contacts.length === 0) {
    return res.status(400).json({
      error: 'user_id, instance_name e contacts[] são obrigatórios.',
    });
  }

  // Cancela sessão ativa anterior do mesmo usuário
  const { rows: existing } = await db.query(
    `SELECT id FROM disparo_sessions WHERE user_id = $1 AND status = 'running'`,
    [user_id]
  );
  for (const row of existing) {
    const ctrl = activeSessions.get(row.id);
    if (ctrl) ctrl.aborted = true;
    await db.query(
      `UPDATE disparo_sessions SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [row.id]
    );
    // Marca itens pendentes/enviando como cancelados
    await db.query(
      `UPDATE disparo_items SET status = 'error', error_message = 'Sessão substituída por novo disparo'
       WHERE session_id = $1 AND status IN ('pending', 'sending')`,
      [row.id]
    );
  }

  // Normaliza e valida telefones antes de criar os itens.
  // Fallback: se falhar sem estado, busca o estado em blitzar_leads_pool pelo telefone
  // (cobre leads já coletados com "55" mas sem DDD, ex: "55999999999").
  const processedContacts = await Promise.all(contacts.map(async (c) => {
    const original = String(c.telefone || '');
    let phoneResult = normalizePhone(original, null);

    if (!phoneResult) {
      // Tenta recuperar o estado do pool para inferir DDD
      try {
        const digitsOnly = original.replace(/\D/g, '');
        const { rows } = await db.query(
          `SELECT estado FROM blitzar_leads_pool
           WHERE regexp_replace(COALESCE(telefone,           ''), '\\D','','g') = $1
              OR regexp_replace(COALESCE(telefone_secundario,''), '\\D','','g') = $1
           LIMIT 1`,
          [digitsOnly]
        );
        if (rows[0]?.estado) {
          phoneResult = normalizePhone(original, rows[0].estado);
          if (phoneResult) {
            console.log(`[disparo] Telefone corrigido via pool: "${original}" → "${phoneResult.normalized}" (estado: ${rows[0].estado})`);
          }
        }
      } catch (lookupErr) {
        console.warn(`[disparo] Falha no lookup de estado para "${original}":`, lookupErr.message);
      }
    }

    if (!phoneResult) {
      console.warn(`[disparo] Telefone inválido: "${original}" (empresa: ${c.empresa})`);
    } else if (phoneResult.warning) {
      console.log(`[disparo] Telefone normalizado: "${original}" → "${phoneResult.normalized}" — ${phoneResult.warning}`);
    }

    return {
      ...c,
      telefoneOriginal: original,
      telefone:         phoneResult?.normalized ?? original,
      _phoneInvalid:    !phoneResult,
    };
  }));

  const preErrorCount = processedContacts.filter(c => c._phoneInvalid).length;

  // Cria nova sessão
  const { rows: [session] } = await db.query(
    `INSERT INTO disparo_sessions (user_id, instance_name, mensagem_base, total)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [user_id, instance_name, mensagem_base || '', contacts.length]
  );

  // Insere todos os itens — itens com telefone inválido já entram como 'error'
  if (processedContacts.length > 0) {
    const params = [];
    const valueParts = processedContacts.map((c, i) => {
      const base     = i * 8;
      const status   = c._phoneInvalid ? 'error' : 'pending';
      const errMsg   = c._phoneInvalid
        ? `Telefone inválido: "${c.telefoneOriginal}"`
        : null;
      params.push(
        session.id,
        i,
        String(c.empresa  || ''),
        String(c.telefone || ''),
        String(c.mensagem || ''),
        Number(c.intervalo_ms) || 10000,
        status,
        errMsg
      );
      return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8})`;
    });

    await db.query(
      `INSERT INTO disparo_items
         (session_id, position, empresa, telefone, mensagem, intervalo_ms, status, error_message)
       VALUES ${valueParts.join(',')}`,
      params
    );
  }

  // Pré-registra erros de telefone inválido no contador da sessão
  if (preErrorCount > 0) {
    await db.query(
      `UPDATE disparo_sessions SET errors = $2 WHERE id = $1`,
      [session.id, preErrorCount]
    );
    console.log(`[disparo] ${preErrorCount} contato(s) com telefone inválido marcados como erro antes do disparo.`);
  }

  // Inicia processamento assíncrono (não bloqueia a resposta HTTP)
  processDisparoSession(session.id, instance_name).catch(console.error);

  console.log(`[disparo] Sessão ${session.id} iniciada: ${contacts.length} contatos (${preErrorCount} inválidos), instância ${instance_name}`);
  res.json({ session_id: session.id, total: contacts.length });
});

// ─── GET /api/disparo/active ──────────────────────────────────────────────────
/**
 * Retorna a sessão mais recente de um usuário:
 *   - running: sessão em andamento (active: true)
 *   - completed/cancelled/failed nas últimas 2h: para exibir resumo ao reabrir (active: false)
 * Query: ?user_id=<uuid>
 * Resposta: { active: false } | { active: true, session } | { active: false, session } (recente)
 */
app.get('/api/disparo/active', async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id é obrigatório.' });

  // 1. Prioridade: sessão running
  const { rows: [running] } = await db.query(
    `SELECT * FROM disparo_sessions
     WHERE user_id = $1 AND status = 'running'
     ORDER BY created_at DESC LIMIT 1`,
    [user_id]
  );
  if (running) return res.json({ active: true, session: running });

  // 2. Fallback: sessão recente (últimas 2h) — permite exibir resumo ao reabrir o sistema
  const { rows: [recent] } = await db.query(
    `SELECT * FROM disparo_sessions
     WHERE user_id = $1
       AND status IN ('completed', 'cancelled', 'failed')
       AND updated_at > NOW() - INTERVAL '2 hours'
     ORDER BY updated_at DESC LIMIT 1`,
    [user_id]
  );
  if (recent) return res.json({ active: false, session: recent });

  res.json({ active: false });
});

// ─── GET /api/disparo/:id/status ──────────────────────────────────────────────
/**
 * Retorna estado detalhado de uma sessão específica, com todos os seus itens.
 * Usado pelo frontend para acompanhar progresso quando o sessionId é conhecido.
 */
app.get('/api/disparo/:id/status', async (req, res) => {
  const { rows: [session] } = await db.query(
    `SELECT * FROM disparo_sessions WHERE id = $1`,
    [req.params.id]
  );
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada.' });

  const { rows: items } = await db.query(
    `SELECT id, position, empresa, telefone, status, error_message, sent_at
     FROM disparo_items WHERE session_id = $1 ORDER BY position`,
    [req.params.id]
  );

  res.json({ session, items });
});

// ─── POST /api/disparo/:id/cancel ─────────────────────────────────────────────
/**
 * Cancela uma sessão em andamento.
 * O abort é sinalizado ao loop assíncrono via activeSessions map.
 * Itens ainda pendentes são marcados como cancelados.
 */
app.post('/api/disparo/:id/cancel', async (req, res) => {
  const { id } = req.params;

  const ctrl = activeSessions.get(id);
  if (ctrl) ctrl.aborted = true;

  await db.query(
    `UPDATE disparo_sessions SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
    [id]
  );
  await db.query(
    `UPDATE disparo_items SET status = 'error', error_message = 'Cancelado pelo usuário'
     WHERE session_id = $1 AND status IN ('pending', 'sending')`,
    [id]
  );

  console.log(`[disparo] Sessão ${id} cancelada pelo usuário.`);
  res.json({ ok: true });
});

// ─── POST /api/contacts/prospeccao ───────────────────────────────────────────
/**
 * Enriquece um lote de contatos com dados do funil de prospecção (blitzar_prospeccao).
 * Body: { phones: string[] }  — lista de telefones normalizados (somente dígitos, ex: 5511999999999)
 * Resposta: array de { telefone, etapa, status, qualificado, opt_out, total_respostas, ultimo_contato }
 */
app.post('/api/contacts/prospeccao', async (req, res) => {
  const { phones } = req.body;
  if (!Array.isArray(phones) || !phones.length) return res.json([]);
  // Sanitiza: aceita apenas strings com dígitos (sem risco de SQL injection via parameterized query,
  // mas evitamos lixo no array de qualquer forma)
  const sanitized = phones
    .filter(p => typeof p === 'string' && /^\d+$/.test(p.trim()))
    .map(p => p.trim())
    .slice(0, 2000); // limite de segurança
  if (!sanitized.length) return res.json([]);
  try {
    const { rows } = await db.query(
      `SELECT telefone, etapa, status, qualificado, opt_out, total_respostas, ultimo_contato
       FROM blitzar_prospeccao
       WHERE telefone = ANY($1::text[])`,
      [sanitized]
    );
    res.json(rows);
  } catch (err) {
    console.error('[prospeccao] Erro ao buscar dados do funil:', err);
    res.status(500).json({ error: 'Erro interno ao consultar funil.' });
  }
});

// ─── Contacts VPS — tabela + endpoints ───────────────────────────────────────
/**
 * Garante que a tabela contacts existe no VPS.
 * Substitui a tabela contacts do Supabase — auth continua no Supabase.
 * Idempotente: CREATE TABLE IF NOT EXISTS.
 */
async function ensureContactsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS contacts (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id              TEXT NOT NULL,
      empresa              TEXT NOT NULL,
      telefone             TEXT NOT NULL,
      ultima_mensagem      TEXT,
      ultima_mensagem_data TIMESTAMPTZ,
      created_at           TIMESTAMPTZ DEFAULT NOW(),
      updated_at           TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, telefone)
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id, created_at DESC)`);
}

// GET /api/contacts?user_id=
app.get('/api/contacts', async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' });
  const { rows } = await db.query(
    `SELECT id, user_id, empresa, telefone, ultima_mensagem, ultima_mensagem_data, created_at, updated_at
     FROM contacts
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [user_id]
  );
  res.json(rows);
});

// POST /api/contacts/bulk — upsert em lote; usado por saveContactsFromFile e migração
// Body: { user_id, contacts: [{empresa, telefone}] }
app.post('/api/contacts/bulk', async (req, res) => {
  const { user_id, contacts: list } = req.body;
  if (!user_id || !Array.isArray(list) || list.length === 0) {
    return res.status(400).json({ error: 'user_id e contacts[] obrigatórios' });
  }

  // Deduplica por telefone antes de inserir
  const seen = new Set();
  const deduped = list.filter(c => {
    const key = String(c.telefone || '').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return c.empresa;
  });

  if (deduped.length === 0) return res.json({ count: 0 });

  const params = [];
  const valueParts = deduped.map((c, i) => {
    const base = i * 3;
    params.push(user_id, String(c.empresa).trim(), String(c.telefone).trim());
    return `($${base + 1}, $${base + 2}, $${base + 3})`;
  });

  await db.query(
    `INSERT INTO contacts (user_id, empresa, telefone)
     VALUES ${valueParts.join(',')}
     ON CONFLICT (user_id, telefone)
     DO UPDATE SET empresa = EXCLUDED.empresa, updated_at = NOW()`,
    params
  );

  res.json({ count: deduped.length });
});

// PATCH /api/contacts/message — atualiza última mensagem enviada
// Body: { user_id, telefone, mensagem }
app.patch('/api/contacts/message', async (req, res) => {
  const { user_id, telefone, mensagem } = req.body;
  if (!user_id || !telefone) return res.status(400).json({ error: 'user_id e telefone obrigatórios' });
  const { rows: [row] } = await db.query(
    `UPDATE contacts
     SET ultima_mensagem = $3, ultima_mensagem_data = NOW(), updated_at = NOW()
     WHERE user_id = $1 AND telefone = $2
     RETURNING *`,
    [user_id, String(telefone), mensagem || null]
  );
  res.json(row ?? null);
});

// PUT /api/contacts/:id — atualiza empresa e/ou telefone
// Body: { user_id, empresa, telefone }
app.put('/api/contacts/:id', async (req, res) => {
  const { id } = req.params;
  const { user_id, empresa, telefone } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' });
  const { rows: [row] } = await db.query(
    `UPDATE contacts
     SET empresa = $3, telefone = $4, updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [id, user_id, String(empresa || '').trim(), String(telefone || '').trim()]
  );
  res.json(row ?? null);
});

// DELETE /api/contacts/:id?user_id=
app.delete('/api/contacts/:id', async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id obrigatório' });
  await db.query(
    `DELETE FROM contacts WHERE id = $1 AND user_id = $2`,
    [id, user_id]
  );
  res.json({ ok: true });
});

// ─── Startup ──────────────────────────────────────────────────────────────────
const PORT = cfg('PORT') || 3001;
app.listen(PORT, async () => {
  console.log(`✅ API server rodando em http://localhost:${PORT}`);
  await ensureContactsTable();
  // Retoma sessões de disparo que estavam rodando antes do restart
  await resumePendingSessions();
});
