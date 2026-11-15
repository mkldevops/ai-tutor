#!/usr/bin/env bash
set -euo pipefail

directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
local_env="$directory/appwrite.local"
[[ -f "$local_env" ]] || local_env="$directory/appwrite.local.example"

docker compose --env-file "$local_env" -f "$directory/compose.yaml" down "$@"
