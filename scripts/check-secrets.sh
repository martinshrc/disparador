#!/usr/bin/env bash
# check-secrets.sh — Varre arquivos rastreados pelo git em busca de credenciais reais.
# Lê os valores dos .env locais dinamicamente. Rode antes de qualquer commit.
#
# Uso: bash scripts/check-secrets.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_ENV="$ROOT/backend/.env"
FRONTEND_ENV="$ROOT/frontend/.env"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

SECRETS=()

# Extrai valores de um .env (ignora linhas vazias, comentários e valores placeholder)
load_env() {
  local file="$1"
  if [[ ! -f "$file" ]]; then return; fi
  while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" == \#* ]] && continue
    key="${key// /}"
    value="${value// /}"
    # Ignora placeholders óbvios
    [[ "$value" == *"sua-"* || "$value" == *"seu-"* || -z "$value" ]] && continue
    # Ignora valores muito curtos (< 16 chars) — muito genéricos para buscar
    [[ ${#value} -lt 16 ]] && continue
    SECRETS+=("$value")
  done < "$file"
}

load_env "$BACKEND_ENV"
load_env "$FRONTEND_ENV"

if [[ ${#SECRETS[@]} -eq 0 ]]; then
  echo -e "${YELLOW}Nenhum segredo encontrado nos .env — nada para checar.${NC}"
  exit 0
fi

echo "Verificando ${#SECRETS[@]} valores dos .env em arquivos rastreados pelo git..."
echo ""

# Arquivos rastreados pelo git (excluindo os próprios .env, que não são commitados)
TRACKED=$(git -C "$ROOT" ls-files | grep -v '\.env$' || true)

FOUND=0

for secret in "${SECRETS[@]}"; do
  # Usa os primeiros 16 chars para evitar falsos positivos em strings longas
  snippet="${secret:0:16}"
  matches=$(echo "$TRACKED" | xargs -I{} grep -lF "$snippet" "$ROOT/{}" 2>/dev/null || true)
  if [[ -n "$matches" ]]; then
    echo -e "${RED}VAZAMENTO detectado: '${snippet}...' encontrado em:${NC}"
    echo "$matches" | sed 's/^/  /'
    FOUND=$((FOUND + 1))
  fi
done

echo ""
if [[ $FOUND -eq 0 ]]; then
  echo -e "${GREEN}OK — nenhuma credencial real encontrada nos arquivos rastreados.${NC}"
  exit 0
else
  echo -e "${RED}BLOQUEADO — $FOUND segredo(s) encontrado(s). Corrija antes de fazer commit.${NC}"
  exit 1
fi
