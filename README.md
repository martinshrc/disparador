# Blitzar Labs - Disparador

Disparos B2B com IA Anti-Bloqueio. Geração de mensagens personalizadas por IA (Gemini ou OpenAI) e envio via Evolution API + N8N. Fila de disparo persistente gerenciada pelo backend — fechar o browser não interrompe o processo.

## Arquitetura

| Camada | Stack | Deploy |
|--------|-------|--------|
| Frontend | React + Vite + TypeScript + shadcn/ui | Hospedagem estática (pasta `dist/`) |
| Backend | Node.js + Express + pg | EasyPanel (`n8n-test/disparador`) via nixpacks |
| Banco principal | Supabase (PostgreSQL + Auth) | Cloud |
| Banco VPS | PostgreSQL `195.35.42.27:4375/labs_management` | VPS própria |
| Automação | N8N (funil de prospecção 3 etapas + Leticia) | EasyPanel |

## Como rodar localmente

Requisito: Node.js 18+ e npm.

```sh
# Frontend
cd frontend
cp .env.example .env        # preencher variáveis
npm install
npm run dev                 # http://localhost:8080

# Backend (em outro terminal)
cd backend
cp .env.example .env        # preencher variáveis
npm install
node server.js              # http://localhost:3001
```

## Variáveis de ambiente

### `frontend/.env`
```env
VITE_SUPABASE_URL=https://seu-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua-chave-anon
VITE_N8N_WEBHOOK_SECRET=seu-secret
VITE_N8N_WEBHOOK_URL=https://seu-n8n/webhook/disparador
VITE_API_URL=http://localhost:3001
VITE_BACKEND_API_KEY=sua-chave-backend
```

### `backend/.env`
```env
PG_HOST=195.35.42.27
PG_PORT=4375
PG_USER=sa
PG_PASSWORD=sua-senha
PG_DATABASE=labs_management
CNPJA_API_KEY_1=sua-chave-cnpja
BACKEND_API_KEY=sua-chave-backend
PORT=3001
ALLOWED_ORIGINS=http://localhost:8080
```

Os `.env` reais **nunca** são commitados (`.gitignore`). Use os `.env.example` como referência.

## Funcionalidades principais

- **Disparo batch persistente** — fila gerenciada pelo backend via `disparo_sessions` + `disparo_items` (VPS Postgres). Fechar o browser não interrompe o envio.
- **Geração de mensagem com IA** — varia o texto por contato para evitar bloqueio (Gemini ou OpenAI, chave configurada por usuário no app).
- **Lista de disparo com filtros** — Primeiro contato / Já enviou / Funil (Ativo · Frio · Qualificado · Opt-out) / Etapa 1-2-3 / Segmento. Remoção persistente por usuário (localStorage).
- **Status em tempo real** — coluna de status atualizada a cada ~5s durante o disparo (sucesso / erro / enviando).
- **Coletar Leads** — busca empresas via CNPJA por CNAE + estado e salva no pool (`blitzar_leads_pool`).
- **Funil de prospecção N8N** — 3 etapas automáticas + qualificação por IA + agendamento (Leticia).
- **Conector WhatsApp** — vincula instância Evolution API ao usuário.

## Deploy

**Frontend:**
```sh
cd frontend && npm run build
# Subir pasta dist/ na hospedagem estática
```

**Backend:**
- Push no `main` → EasyPanel detecta e faz redeploy automático via nixpacks.

## Testes

```sh
cd frontend
npm test              # rodar testes
npm run test:coverage # cobertura
```

Testes em `frontend/src/lib/__tests__/`: retry, errors, fileParser, utils.
