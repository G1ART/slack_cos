# vNext.13.52 — Cursor direct callback proof + callback absence + GitHub secondary

## 요약

- **Primary 실행 신호**: Cursor `/webhooks/cursor` 직접 콜백(서명 검증 + JSON 파싱 + 상관관계).
- **Ops 증거**: `COS_OPS_SMOKE_ENABLED=1`일 때 `cos_cursor_webhook_ingress_safe` 이벤트(또는 Supabase `cos_ops_smoke_events`)에 안전 부분집합만 기록. raw body·전체 URL·시크릿·헤더 전체 값 저장 없음.
- **accepted_external_id 이후**: `trigger_accepted_callback_pending` 단계 기록; 타임아웃 후 `cursor_callback_absent_within_timeout` (기본 `COS_CURSOR_CALLBACK_ABSENCE_TIMEOUT_SEC=120`).
- **GitHub**: `cos_github_fallback_evidence` + `cos_run_events`의 `external_*`는 **감사/부차 증거**만. **패킷 완료·런 터미널 상태는 GitHub만으로 진행하지 않음** (`canonicalExternalEvent`에서 GitHub `applyExternalPacketProgressStateForRun` 제거).
- **`recordOpsSmokeAfterExternalMatch`**: **cursor** provider만 (GitHub 매치는 ops 파이프라인 단계를 채우지 않음).
- **필드 shape**: `peekCursorWebhookObservedSchemaSnapshot` — env path override가 설정되어 있으면 해당 소스 이름이 스냅샷에 반영.

## 인바운드

- `handleCursorWebhookIngress`: `request_id` 옵션; `p.env`가 부분 객체면 `process.env`와 병합.
- `handleGithubWebhookIngress`: 동일 env 병합.

## 93e0 브랜치

- **superseded** (13.50 문서와 동일). 이번 13.52에서 흡수 불필요.
- **delete now = yes** (원격 브랜치 삭제 권장).

## Owner actions

### 로컬 검증

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
```

### Git (동기화)

```bash
cd /Users/hyunminkim/g1-cos-slack
git status
git pull --rebase origin "$(git branch --show-current)"
git add -A
git commit -m "vNext.13.52: cursor callback proof, absence classification, GitHub secondary"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```

### SQL

이번 패치에 SQL 없음.
