#!/usr/bin/env bash
set -euo pipefail

directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository="$(cd "$directory/../.." && pwd)"
target="${1:-local}"
if [[ "$target" == "local" ]]; then
  endpoint="http://127.0.0.1:${AI_TUTOR_APPWRITE_PORT:-18480}/v1"
  project="ai-tutor-local"
  env_file="$repository/.env"
  credentials="$directory/console-admin.local"
else
  endpoint="${APPWRITE_REMOTE_ENDPOINT:?Set APPWRITE_REMOTE_ENDPOINT, e.g. https://appwrite.example.com/v1}"
  project="ai-tutor"
  env_file="$repository/.env.$target.local"
  credentials="$directory/console-admin.$target.local"
fi

if [[ ! -f "$credentials" ]]; then
  umask 077
  {
    printf '%s\n' 'ADMIN_EMAIL=admin@ai-tutor.test'
    printf 'ADMIN_PASSWORD=%s\n' "$(openssl rand -hex 24)"
  } >"$credentials"
  chmod 600 "$credentials"
fi

if [[ -f "$env_file" ]] && grep -q "^APPWRITE_ENDPOINT=$endpoint$" "$env_file" \
  && grep -q '^APPWRITE_API_KEY=.\+' "$env_file"; then
  echo "$(basename "$env_file") already points at $endpoint; skipping key creation."
else
  node "$directory/bootstrap.mjs" "$credentials" "$env_file" "$repository/.env.example" "$endpoint" "$project"
fi

cd "$repository"
node --env-file="$env_file" scripts/appwrite-setup.ts
