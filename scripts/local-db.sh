#!/usr/bin/env bash
# Cria um banco PostgreSQL local com shim do Supabase, aplica migrações e seed.
# Uso: DATABASE_URL=postgres://postgres:postgres@localhost:5432/restaurante_test bash scripts/local-db.sh
set -euo pipefail
DB_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/restaurante_test}"
ADMIN_URL="${DB_URL%/*}/postgres"
DB_NAME="${DB_URL##*/}"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -c "drop database if exists \"$DB_NAME\"" -c "create database \"$DB_NAME\""
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f tests/db/supabase-shim.sql
for f in supabase/migrations/*.sql; do
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f supabase/seed.sql
echo "Banco local pronto: $DB_URL"
