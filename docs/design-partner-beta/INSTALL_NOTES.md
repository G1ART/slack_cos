# INSTALL_NOTES — Design Partner Beta

참조 파일:
- `SLACK_APP_MANIFEST.reference.json` — Slack app 생성 시 “From an app manifest” 로 참조할 manifest(bot scopes, event subscriptions, socket mode).
- `BYO_KEYS_INFRA_STANCE.md` — customer-dedicated 배포·BYO 원칙.
- `OPERATOR_SMOKE_TEST_CHECKLIST.md` — 첫 스모크 시나리오.
- `KNOWN_HUMAN_GATE_POINTS.md` — 자동화가 끝나는 지점.

## 개요

## 배포 모델

- Customer-dedicated 배포. 각 파트너는 자신의 런타임(Railway/Fly/자체 k8s 등) 에 인스턴스를 띄운다.
- Customer-owned keys. 모든 provider 키는 파트너 계정의 것이며, COS 프로젝트가 중앙에서 대신 보관하지 않는다.
- 저장소: 권장 Supabase 프로젝트 (파트너 소유) + `supabase/migrations/` 적용.

## 요구되는 최소 provider

- Slack workspace + Slack app (Bot token + App token)
- OpenAI API key
- (선택) GitHub repo + token
- (선택) Supabase 프로젝트 + service role key
- (선택) Railway token
- (선택) Cursor automation endpoint

비어 있는 provider 는 artifact 모드로만 동작하며, 해당 sink 는 live 쓰기 없이 fail-closed 됩니다.

## 설치 단계

1. 저장소를 fork 하거나 release tarball 을 수령한다.
2. `.env.example` 를 `.env` 로 복사하고 필수 값을 채운다 (manifest reference 의 scopes 와 일치해야 한다).
3. Supabase 를 쓰는 경우 `supabase/migrations/` 를 순서대로 적용한다.
4. `npm install` 후 `npm run preflight:design_partner_beta_qualification` 로 필독 문서 매니페스트가 무결한지 확인한다.
5. 최소 한 개 sink 를 `scripts/qualify-live-binding-capability.mjs --sink <name> --mode live --verified-by <email>` 로 `live_verified` 로 올린다.
6. `scripts/audit-delivery-readiness.mjs --project-space-key <key> --json` 결과가 `ready` 또는 `needs_verification` 경계에 있는지 확인한다.
7. 프로세스를 실행한다 (Slack Socket Mode).

## 배포 가정

- 단일 프로세스 권장. 동일 `SLACK_APP_TOKEN` 으로 다중 프로세스를 띄우면 이벤트가 나뉜다.
- Inbound webhook 은 동일 호스트에서 수신하며, 경로는 `/webhooks/github`, `/webhooks/cursor`, `/webhooks/railway`.
- 상태 저장은 기본 file-store. 운영에는 Supabase 키 투입을 권장.
- run store mode: `COS_RUN_STORE=memory` 는 테스트용. 운영에선 비워두거나 `supabase`.

## 지원 경계

- COS 본체 코드 외의 파트너 환경 이슈(네트워크·provider 정책·계정 제한) 는 human-gate 로 드러나지만 COS 가 대신 승인하지 않는다.
- 자동 upgrade/migration 파이프라인은 포함되지 않는다. 파트너가 버전 변경을 명시적으로 수행한다.
