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
  methods: ['GET', 'POST', 'OPTIONS'],
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
      phones[0]?.number ?? null,
      phones[1]?.number ?? null,
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
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'enviado')`,
              [sessionUserId, poolRow?.lead_id || null, item.empresa, poolRow?.cnpj || null,
               item.telefone, sessionMsgBase, item.mensagem, instanceName]
            );
          } catch (logErr) {
            console.warn(`[disparo] Falha ao gravar log (telefone ${item.telefone}):`, logErr.message);
          }
        }
      } catch (err) {
        await db.query(
          `UPDATE disparo_items SET status = 'error', error_message = $2 WHERE id = $1`,
          [item.id, String(err.message).slice(0, 500)]
        );
        await db.query(
          `UPDATE disparo_sessions SET errors = errors + 1, updated_at = NOW() WHERE id = $1`,
          [sessionId]
        );
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

// ─── GET /api/leads/pool ──────────────────────────────────────────────────────
app.get('/api/leads/pool', async (req, res) => {
  const { estado, cnae, cidade, search, limit = 50, offset = 0 } = req.query;

  const conditions = [];
  const params = [];

  if (estado) { params.push(estado);           conditions.push(`estado = $${params.length}`); }
  if (cnae)   { params.push(parseInt(String(cnae)));   conditions.push(`cnae_principal_codigo = $${params.length}`); }
  if (cidade) { params.push(`%${cidade}%`);    conditions.push(`cidade ILIKE $${params.length}`); }
  if (search) {
    params.push(`%${search}%`);
    const n = params.length;
    conditions.push(`(razao_social ILIKE $${n} OR nome_fantasia ILIKE $${n} OR cnpj ILIKE $${n})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const dataParams = [...params, parseInt(String(limit)), parseInt(String(offset))];
  const { rows } = await db.query(
    `SELECT id, cnpj, razao_social, nome_fantasia, data_abertura, porte,
            cnae_principal_codigo, cnae_principal_texto, segmento,
            telefone, telefone_secundario, email,
            cidade, estado, cep, simples_nacional, mei, created_at
     FROM blitzar_leads_pool ${where}
     ORDER BY created_at DESC
     LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
    dataParams
  );

  const { rows: [{ total }] } = await db.query(
    `SELECT COUNT(*) AS total FROM blitzar_leads_pool ${where}`,
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

  // Cria nova sessão
  const { rows: [session] } = await db.query(
    `INSERT INTO disparo_sessions (user_id, instance_name, mensagem_base, total)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [user_id, instance_name, mensagem_base || '', contacts.length]
  );

  // Insere todos os itens com query parametrizada (segura contra SQL injection)
  if (contacts.length > 0) {
    const params = [];
    const valueParts = contacts.map((c, i) => {
      const base = i * 6;
      params.push(
        session.id,
        i,
        String(c.empresa  || ''),
        String(c.telefone || ''),
        String(c.mensagem || ''),
        Number(c.intervalo_ms) || 10000
      );
      return `($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6})`;
    });

    await db.query(
      `INSERT INTO disparo_items (session_id, position, empresa, telefone, mensagem, intervalo_ms)
       VALUES ${valueParts.join(',')}`,
      params
    );
  }

  // Inicia processamento assíncrono (não bloqueia a resposta HTTP)
  processDisparoSession(session.id, instance_name).catch(console.error);

  console.log(`[disparo] Sessão ${session.id} iniciada: ${contacts.length} contatos, instância ${instance_name}`);
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

// ─── Startup ──────────────────────────────────────────────────────────────────
const PORT = cfg('PORT') || 3001;
app.listen(PORT, async () => {
  console.log(`✅ API server rodando em http://localhost:${PORT}`);
  // Retoma sessões de disparo que estavam rodando antes do restart
  await resumePendingSessions();
});
