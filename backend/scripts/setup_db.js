import pg from 'pg';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const p = existsSync(resolve(__dirname, '../.env'))
    ? resolve(__dirname, '../.env')
    : resolve(__dirname, '../../.env');
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

if (!cfg('PG_HOST')) { console.error('❌ PG_HOST não definida'); process.exit(1); }

const { Client } = pg;
const db = new Client({
  host:     cfg('PG_HOST'),
  port:     parseInt(cfg('PG_PORT') || '5432'),
  user:     cfg('PG_USER'),
  password: cfg('PG_PASSWORD'),
  database: cfg('PG_DATABASE'),
  ssl:      false,
});

const SQL = {
  pool: `
    CREATE TABLE IF NOT EXISTS blitzar_leads_pool (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      cnpj                  VARCHAR(14) NOT NULL UNIQUE,
      razao_social          TEXT,
      nome_fantasia         TEXT,
      data_abertura         DATE,
      eh_matriz             BOOLEAN DEFAULT true,
      natureza_juridica     TEXT,
      porte                 VARCHAR(20),
      capital_social        NUMERIC(15,2),
      simples_nacional      BOOLEAN DEFAULT false,
      mei                   BOOLEAN DEFAULT false,
      cnae_principal_codigo INTEGER,
      cnae_principal_texto  TEXT,
      cnaes_secundarios     JSONB,
      telefone              TEXT,
      telefone_secundario   TEXT,
      email                 TEXT,
      website               TEXT,
      logradouro            TEXT,
      numero                TEXT,
      complemento           TEXT,
      bairro                TEXT,
      cidade                TEXT,
      estado                CHAR(2),
      cep                   VARCHAR(8),
      latitude              NUMERIC(10,7),
      longitude             NUMERIC(10,7),
      segmento              TEXT,
      fonte                 VARCHAR(30) DEFAULT 'cnpja',
      dados_brutos          JSONB,
      created_at            TIMESTAMPTZ DEFAULT NOW(),
      updated_at            TIMESTAMPTZ DEFAULT NOW()
    )
  `,
  leads: `
    CREATE TABLE blitzar_leads (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id              TEXT NOT NULL,
      pool_lead_id         UUID NOT NULL REFERENCES blitzar_leads_pool(id) ON DELETE CASCADE,
      status_lead          VARCHAR(20) DEFAULT 'novo',
      quantidade_disparos  INT DEFAULT 0,
      ultimo_disparo_at    TIMESTAMPTZ,
      proxima_tentativa_at TIMESTAMPTZ,
      ultima_mensagem      TEXT,
      notas                TEXT,
      tags                 TEXT[],
      created_at           TIMESTAMPTZ DEFAULT NOW(),
      updated_at           TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, pool_lead_id)
    )
  `,
  dispatch: `
    CREATE TABLE blitzar_dispatch_log (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         TEXT NOT NULL,
      lead_id         UUID REFERENCES blitzar_leads(id) ON DELETE SET NULL,
      empresa         TEXT NOT NULL,
      cnpj            VARCHAR(14),
      telefone        TEXT NOT NULL,
      mensagem_base   TEXT NOT NULL,
      mensagem_ia     TEXT,
      instance_name   TEXT,
      status          VARCHAR(20) NOT NULL DEFAULT 'pendente',
      error_message   TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `,
};

async function main() {
  await db.connect();

  // 1. Pool geral
  await db.query(SQL.pool);
  await db.query('CREATE INDEX IF NOT EXISTS idx_pool_cnae     ON blitzar_leads_pool(cnae_principal_codigo)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_pool_cidade   ON blitzar_leads_pool(cidade, estado)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_pool_segmento ON blitzar_leads_pool(segmento)');
  console.log('✅ blitzar_leads_pool OK');

  // 2. Migrar dados existentes para o pool (schema antigo pode divergir — skip se falhar)
  const { rows: existing } = await db.query('SELECT * FROM blitzar_leads').catch(() => ({ rows: [] }));
  let migrated = 0;
  for (const r of existing) {
    const toJson = (v) => {
      if (v === null || v === undefined) return null;
      if (typeof v === 'object') return JSON.stringify(v);
      try { JSON.parse(v); return v; } catch { return null; }
    };
    await db.query(
      `INSERT INTO blitzar_leads_pool
        (cnpj,razao_social,nome_fantasia,data_abertura,eh_matriz,natureza_juridica,porte,
         capital_social,simples_nacional,mei,cnae_principal_codigo,cnae_principal_texto,
         cnaes_secundarios,telefone,telefone_secundario,email,logradouro,numero,
         complemento,bairro,cidade,estado,cep,segmento,fonte,dados_brutos)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
       ON CONFLICT (cnpj) DO NOTHING`,
      [r.cnpj,r.razao_social,r.nome_fantasia,r.data_abertura,r.eh_matriz,r.natureza_juridica,r.porte,
       r.capital_social,r.simples_nacional,r.mei,r.cnae_principal_codigo,r.cnae_principal_texto,
       toJson(r.cnaes_secundarios),r.telefone,r.telefone_secundario,r.email,r.logradouro,r.numero,
       r.complemento,r.bairro,r.cidade,r.estado,r.cep,r.segmento,r.fonte,toJson(r.dados_brutos)]
    ).then(() => migrated++).catch(() => {});
  }
  console.log('✅ Migrados para pool:', migrated, '/', existing.length);

  // 3. Recriar blitzar_leads e dispatch_log
  await db.query('DROP TABLE IF EXISTS blitzar_dispatch_log CASCADE');
  await db.query('DROP TABLE IF EXISTS blitzar_leads CASCADE');
  await db.query(SQL.leads);
  await db.query('CREATE INDEX IF NOT EXISTS idx_leads_user_status ON blitzar_leads(user_id, status_lead)');
  console.log('✅ blitzar_leads recriada');

  await db.query(SQL.dispatch);
  await db.query('CREATE INDEX IF NOT EXISTS idx_dispatch_user ON blitzar_dispatch_log(user_id, created_at DESC)');
  console.log('✅ blitzar_dispatch_log recriada');

  // 4. Vincular pool ao user de teste
  const { rows: pool } = await db.query('SELECT id FROM blitzar_leads_pool');
  for (const p of pool) {
    await db.query(
      'INSERT INTO blitzar_leads (user_id, pool_lead_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      ['teste_heric_sp_alimenticio', p.id]
    );
  }
  console.log('✅ Leads vinculados ao user teste');

  // 5. Confirmar
  const { rows: s } = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM blitzar_leads_pool)    AS pool,
      (SELECT COUNT(*) FROM blitzar_leads)          AS leads_usuario,
      (SELECT COUNT(*) FROM blitzar_dispatch_log)   AS dispatches
  `);
  console.log('\n📊 Pool geral:', s[0].pool, '| Leads usuário:', s[0].leads_usuario, '| Dispatch log:', s[0].dispatches);

  await db.end();
}

main().catch(e => { console.error('ERRO:', e.message); db.end(); });
