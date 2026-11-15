#!/usr/bin/env bash
set -euo pipefail

directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository="$(cd "$directory/../.." && pwd)"
credentials="$directory/console-admin.local"
port="${AI_TUTOR_APPWRITE_PORT:-18480}"

if [[ ! -f "$credentials" ]]; then
  umask 077
  {
    printf '%s\n' 'ADMIN_EMAIL=admin@ai-tutor.test'
    printf 'ADMIN_PASSWORD=%s\n' "$(openssl rand -hex 24)"
  } >"$credentials"
  chmod 600 "$credentials"
fi

if [[ -f "$repository/.env" ]] && grep -q "^APPWRITE_ENDPOINT=http://127.0.0.1:$port/v1$" "$repository/.env" \
  && grep -q '^APPWRITE_API_KEY=.\+' "$repository/.env"; then
  echo ".env already points at the local Appwrite; skipping key creation."
else
  node "$directory/bootstrap.mjs" "$credentials" "$repository/.env" "$repository/.env.example" "$port"
fi

cd "$repository"
pnpm appwrite:setup
