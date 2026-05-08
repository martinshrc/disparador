# Blitzar Labs - Disparador

Disparos B2B com IA Anti-Bloqueio. Upload de planilha de contatos, geração de mensagens com IA (Gemini ou ChatGPT) e envio via webhook N8N.

## Como rodar o projeto

Requisito: Node.js e npm instalados — [instalar com nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
# 1. Entrar na pasta do projeto
cd <NOME_DA_PASTA>

# 2. Instalar dependências
npm i

# 3. Configurar variáveis de ambiente
# Crie um arquivo .env na raiz (veja seção abaixo)

# 4. Subir o servidor de desenvolvimento
npm run dev
```

**Guia detalhado:** `GUIA_INICIO_RAPIDO.md`

## Configuração de Variáveis de Ambiente

Crie um arquivo `.env` na raiz com:

```env
# Supabase (obrigatório)
VITE_SUPABASE_URL=sua_url_supabase
VITE_SUPABASE_PUBLISHABLE_KEY=sua_chave_anon_public

# Webhook N8N para envio de mensagens
VITE_N8N_WEBHOOK_URL=https://sua-instancia-n8n.com/webhook/disparador
```

- O `.env` não deve ser commitado (já está no `.gitignore`).
- Variáveis precisam começar com `VITE_` para o frontend acessar.
- A chave de API da IA (Gemini/OpenAI) é configurada por usuário em **Configurações de IA** no app, não no `.env`.

## Tecnologias

- Vite, TypeScript, React
- shadcn-ui, Tailwind CSS
- Supabase (PostgreSQL + Auth)
- Google Gemini API e OpenAI (ChatGPT)
- N8N (webhook para WhatsApp)

## Testes

```sh
npm test              # rodar testes
npm run test:ui       # interface visual
npm run test:coverage # cobertura
```

Testes em `src/lib/__tests__/`: retry, errors, fileParser, utils.

## Deploy

Faça o build e hospede a pasta `dist` em qualquer estático (Vercel, Netlify, etc.):

```sh
npm run build
```
