/**
 * backend/server.js — API de Leads
 *
 * Responsabilidade: ponte entre o frontend e o PostgreSQL VPS.
 * Somente dados de leads. Auth/contacts/dispatch continuam no Supabase.
 *
 * Dev:  node server.js           (ou: npm start)
 * PRD:  variáveis via process.env (EasyPanel dashboard)
 */

import express from 'express';
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
  // Procura .env na pasta do backend ou na raiz do projeto
  const p = existsSync(resolve(__dirname, '.env'))
    ? resolve(__dirname, '.env')
    : resolve(__dirname, '../.env');
  if (!existsSync(p)) return {};
  const env = {};
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return env;
}
const ENV = loadEnv();
const cfg = (k) => process.env[k] ?? ENV[k];

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

// CORS — restringe a origens conhecidas
const ALLOWED_ORIGINS = (cfg('ALLOWED_ORIGINS') || 'http://localhost:8080')
  .split(',')
  .map((s) => s.trim());

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Rate limit — 100 req/min por IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em 1 minuto.' },
});
app.use('/api', limiter);

// API Key — rejeita requests sem a chave correta
const BACKEND_API_KEY = cfg('BACKEND_API_KEY');
app.use('/api', (req, res, next) => {
  if (!BACKEND_API_KEY) return next(); // sem chave configurada: passa (dev sem .env)
  const key = req.headers['x-api-key'];
  if (key !== BACKEND_API_KEY) return res.status(401).json({ error: 'Não autorizado.' });
  next();
});

app.use(express.json());

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

const PORT = cfg('PORT') || 3001;
app.listen(PORT, () => console.log(`✅ API server rodando em http://localhost:${PORT}`));
