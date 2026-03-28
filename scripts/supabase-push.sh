#!/usr/bin/env bash
set -euo pipefail

# Supabase Live Schema Push Helper
#
# 목적:
# - 이 저장소의 SQL migration을 Supabase 프로젝트에 반영한다.
# - 코드가 자동으로 CLI를 실행하지는 않으므로, 대표/운영자가 수동으로 실행한다.
#
# 사전 준비:
# - `supabase` CLI 설치(로컬)
# - Supabase 로그인/토큰
#
# 사용:
#   ./scripts/supabase-push.sh <project-ref> <db-url>
#
# 예시(placeholder):
#   ./scripts/supabase-push.sh g1cos-dev-xxxxx "postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres"

PROJECT_REF="${1:-}"
DB_URL="${2:-}"

if [ -z "${PROJECT_REF}" ] || [ -z "${DB_URL}" ]; then
  echo "usage: $0 <project-ref> <db-url>"
  exit 1
fi

echo "==> supabase login (이미 로그인되어 있으면 생략 가능)"
supabase status >/dev/null 2>&1 || supabase login

echo "==> link project(ref=${PROJECT_REF})"
supabase link --project-ref "${PROJECT_REF}" --db-url "${DB_URL}"

echo "==> db push (migrations/supabase 포함)"
supabase db push

echo "==> done"

