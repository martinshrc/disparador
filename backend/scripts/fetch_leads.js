/**
 * fetch_leads.js — Busca empresas via CNPJA com rotação automática de chaves
 *
 * Uso:
 *   node scripts/fetch_leads.js --estado SP --cnae 5611201 --limite 50
 *   node scripts/fetch_leads.js --estado RJ --cnae 8630503 --limite 100
 *
 * Parâmetros:
 *   --estado   UF (ex: SP, RJ, MG) — obrigatório
 *   --cnae     Código CNAE principal (ex: 5611201 = restaurantes) — obrigatório
 *   --limite   Quantidade de empresas a buscar (default: 20)
 *   --cidade   Filtro de cidade (opcional)
 *   --porte    Filtro: ME, EPP, MEDIO, GRANDE (opcional)
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import pg from 'pg';
import cnpjaPkg from '@cnpja/sdk';
const { Cnpja } = cnpjaPkg;
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Carregar .env manualmente (sem dotenv) ──────────────────────────────────
function loadEnv() {
  const envPath = resolve(__dirname, '../.env');
  const lines = readFileSync(envPath, 'utf8').split('\n');
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const ENV = loadEnv();

// ─── Chaves disponíveis ───────────────────────────────────────────────────────
const API_KEYS = [
  ENV.CNPJA_API_KEY_1,
  ENV.CNPJA_API_KEY_2,
].filter(Boolean);

if (API_KEYS.length === 0) {
  console.error('❌ Nenhuma chave CNPJA_API_KEY_* encontrada no .env');
  process.exit(1);
}

// ─── Parse de args ────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : null;
  };
  return {
    estado: get('--estado'),
    cnae: get('--cnae') ? parseInt(get('--cnae')) : null,
    limite: get('--limite') ? parseInt(get('--limite')) : 20,
    cidade: get('--cidade') ?? null,
    porte: get('--porte') ?? null,
  };
}

// ─── Verificar créditos de uma chave ─────────────────────────────────────────
async function checkCredits(apiKey) {
  const sdk = new Cnpja({ apiKey });
  try {
    const c = await sdk.credit.read();
    return (c.perpetual ?? 0) + (c.transient ?? 0);
  } catch {
    return 0;
  }
}

// ─── Escolher chave ativa com créditos ───────────────────────────────────────
async function selectKey() {
  console.log('\n🔑 Verificando créditos das chaves CNPJA...');
  for (let i = 0; i < API_KEYS.length; i++) {
    const credits = await checkCredits(API_KEYS[i]);
    const short = API_KEYS[i].slice(0, 8) + '...';
    console.log(`   Chave ${i + 1} (${short}): ${credits} créditos`);
    if (credits > 0) {
      return { key: API_KEYS[i], index: i + 1, credits };
    }
  }
  return null;
}

// ─── Salvar lead no pool ──────────────────────────────────────────────────────
async function saveLead(db, office) {
  const address = office.address ?? {};
  const phones = office.phones ?? [];
  const emails = office.emails ?? [];
  const mainActivity = office.mainActivity ?? {};
  const sideActivities = office.sideActivities ?? [];
  const company_ = office.company ?? {};

  const cnpj = (office.taxId ?? '').replace(/\D/g, '');
  if (!cnpj || cnpj.length !== 14) return false;

  // A busca já filtra status=2 (ativa), mas dupla checagem por segurança
  if (office.status?.id !== 2) return false;

  const phone1 = phones[0]?.number ?? null;
  const phone2 = phones[1]?.number ?? null;
  const email1 = emails[0]?.address ?? null;

  await db.query(
    `INSERT INTO blitzar_leads_pool
      (cnpj, razao_social, nome_fantasia, data_abertura, eh_matriz,
       natureza_juridica, porte, capital_social, simples_nacional, mei,
       cnae_principal_codigo, cnae_principal_texto, cnaes_secundarios,
       telefone, telefone_secundario, email,
       logradouro, numero, complemento, bairro, cidade, estado, cep,
       segmento, fonte, dados_brutos)
     VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
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
      phone1,
      phone2,
      email1,
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
  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs();

  if (!args.estado || !args.cnae) {
    console.error('❌ Uso: node scripts/fetch_leads.js --estado SP --cnae 5611201 --limite 50');
    process.exit(1);
  }

  console.log(`\n📋 Configuração:`);
  console.log(`   Estado : ${args.estado}`);
  console.log(`   CNAE   : ${args.cnae}`);
  console.log(`   Limite : ${args.limite}`);
  if (args.cidade) console.log(`   Cidade : ${args.cidade}`);
  if (args.porte)  console.log(`   Porte  : ${args.porte}`);

  // Conectar ao banco
  const db = new pg.Client(ENV.PG_CONNECTION);
  await db.connect();

  let keyInfo = await selectKey();
  if (!keyInfo) {
    console.error('\n❌ Todas as chaves estão sem créditos. Recarregue ou adicione novas chaves no .env (CNPJA_API_KEY_3, etc).');
    await db.end();
    process.exit(1);
  }

  console.log(`\n✅ Usando Chave ${keyInfo.index} (${keyInfo.credits} créditos disponíveis)\n`);

  let sdk = new Cnpja({ apiKey: keyInfo.key });
  let saved = 0;
  let skipped = 0;
  let keyExhausted = false;

  const searchParams = {
    'status.id.in': [2],               // somente ativas
    'address.state.in': [args.estado],
    'mainActivity.id.in': [args.cnae],
  };
  if (args.porte) searchParams['company.size.id.in'] = [args.porte];

  try {
    for await (const page of sdk.office.search(searchParams)) {
      for (const office of page) {
        if (saved >= args.limite) break;

        try {
          const ok = await saveLead(db, office);
          if (ok) {
            saved++;
            const nome = office.company?.name ?? '?';
            process.stdout.write(`\r   ✅ ${saved}/${args.limite} — ${nome.slice(0, 40).padEnd(40)}`);
          } else {
            skipped++;
          }
        } catch (err) {
          // Créditos esgotados nessa chave
          if (err?.status === 429 || err?.message?.includes('credit')) {
            keyExhausted = true;
            break;
          }
          skipped++;
        }
      }

      if (saved >= args.limite || keyExhausted) break;
    }
  } catch (err) {
    if (err?.status === 429 || err?.message?.includes('credit')) {
      keyExhausted = true;
    } else {
      console.error('\n❌ Erro na busca:', err.message);
    }
  }

  if (keyExhausted) {
    console.log(`\n\n⚠️  Chave ${keyInfo.index} esgotou os créditos com ${saved} CNPJs salvos.`);

    // Tentar próxima chave
    const nextKeys = API_KEYS.slice(keyInfo.index); // chaves após a atual
    let found = false;
    for (let i = 0; i < nextKeys.length; i++) {
      const credits = await checkCredits(nextKeys[i]);
      const idx = keyInfo.index + i + 1;
      const short = nextKeys[i].slice(0, 8) + '...';
      console.log(`   Chave ${idx} (${short}): ${credits} créditos`);
      if (credits > 0) {
        console.log(`\n🔄 Chave ${idx} assumiu. Créditos restantes: ${credits}\n`);
        found = true;
        break;
      }
    }
    if (!found) {
      console.log('   ❌ Nenhuma chave com créditos disponível. Adicione mais chaves ao .env.');
    }
  }

  // Verificar créditos restantes de todas as chaves
  console.log('\n\n📊 Créditos restantes por chave:');
  let totalRemaining = 0;
  for (let i = 0; i < API_KEYS.length; i++) {
    const c = await checkCredits(API_KEYS[i]);
    const short = API_KEYS[i].slice(0, 8) + '...';
    console.log(`   Chave ${i + 1} (${short}): ${c} créditos (~${c} CNPJs)`);
    totalRemaining += c;
  }
  console.log(`   Total disponível: ${totalRemaining} créditos`);

  // Resultado final no banco
  const { rows: stats } = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM blitzar_leads_pool) AS pool_total,
      (SELECT COUNT(*) FROM blitzar_leads_pool WHERE created_at > NOW() - INTERVAL '10 minutes') AS pool_novos
  `);

  console.log(`\n🗃️  Banco:`);
  console.log(`   Total no pool  : ${stats[0].pool_total} empresas`);
  console.log(`   Adicionados agora: ${saved} empresas`);
  if (skipped > 0) console.log(`   Ignorados (inativas/duplicatas): ${skipped}`);

  await db.end();
}

main().catch(e => { console.error('\n❌ Erro fatal:', e.message); process.exit(1); });
