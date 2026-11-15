#!/usr/bin/env bash
set -euo pipefail

directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
local_env="$directory/appwrite.local"

if [[ ! -f "$local_env" ]] && docker volume inspect ai-tutor-appwrite_postgresql >/dev/null 2>&1; then
  echo "Volume ai-tutor-appwrite_postgresql exists but infra/appwrite/appwrite.local is missing." >&2
  echo "Restore the file, or run infra/appwrite/down.sh --volumes to start from scratch." >&2
  exit 1
fi

if [[ ! -f "$local_env" ]]; then
  umask 077
  sed \
    -e "s/__RANDOM_OPENSSL_KEY__/$(openssl rand -hex 32)/" \
    -e "s/__RANDOM_JOBS_SECRET__/$(openssl rand -hex 32)/" \
    -e "s/__RANDOM_EXECUTOR_SECRET__/$(openssl rand -hex 32)/" \
    -e "s/__RANDOM_GEO_SECRET__/$(openssl rand -hex 32)/" \
    -e "s/__RANDOM_DB_PASSWORD__/$(openssl rand -hex 24)/" \
    "$directory/appwrite.local.example" >"$local_env"
  chmod 600 "$local_env"
fi

docker compose --env-file "$local_env" -f "$directory/compose.yaml" up --detach --pull missing --wait --wait-timeout 300
