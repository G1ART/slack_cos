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
7. (W13-D) `npm run audit:bootstrap-readiness -- --partner-mode --strict` 로 verdict 가 `pass` 또는 `pass_with_manual_gates` 인지 확인한다. `fail_missing_prereq`/`fail_drift`/`fail_unsafe_mode` 가 나오면 수정 후 재실행한다.
8. 프로세스를 실행한다 (Slack Socket Mode).

## 배포 가정

- 단일 프로세스 권장. 동일 `SLACK_APP_TOKEN` 으로 다중 프로세스를 띄우면 이벤트가 나뉜다.
- Inbound webhook 은 동일 호스트에서 수신하며, 경로는 `/webhooks/github`, `/webhooks/cursor`, `/webhooks/railway`.
- 상태 저장은 기본 file-store. 운영에는 Supabase 키 투입을 권장.
- run store mode: `COS_RUN_STORE=memory` 는 테스트용. 운영에선 비워두거나 `supabase`.
- (W13-D) `COS_DESIGN_PARTNER_MODE=1` 로 기동하는 설치에서는 `COS_RUN_STORE=memory` 가 **boot-time fatal** 로 막힌다. partner install 은 `supabase` 를 사용한다.

## Live rehearsal eligibility (W13-B)

Supabase 운영 모드에서 `live_openai` 런을 실행하려면 **반드시** `ops/rehearsal_eligibility.json` 에 최소 1 건의 `safety_class='sandbox_safe'` 엔트리가 있어야 한다 (primary SSOT). 예시 스키마는 `ops/rehearsal_eligibility.example.json` 참조.

- 파일이 없거나 safe entry 가 없는 프로젝트 스페이스 → `live_openai` 는 `inconclusive` 로 막힘(fail-closed).
- 감사용 mirror: 같은 결정이 `public.project_space_bindings.rehearsal_safety_class_json` 에 반영될 수 있으나, 실시간 판정은 로컬 파일이 우선이다.
- `fixture_replay` 는 Supabase 모드에서도 허용되며, 내부적으로 메모리 store 로 임시 격리된다.

## Live write surface (W13-A) — 정직한 범위

- **GitHub Actions secrets**: `libsodium-wrappers` 로 `crypto_box_seal` 후 `PUT /repos/:owner/:repo/actions/secrets/:name` 로 실제 암호 쓰기를 수행한다. write-back 은 불가하므로 COS 는 `existence_only` 로만 검증하고 founder 에게 “워크플로우에서 직접 확인해 달라”는 자연어를 보낸다.
- **Vercel Project Env**: `POST/PATCH /v10/projects/{id}/env` 로 실제 쓰기를 수행한다. 적용은 다음 배포 시점이라 `requires_redeploy_to_apply: true` 가 표시된다.
- **Railway / Supabase**: 각각 `artifact_only`·`live_verified_read_only` 로 고정. live 쓰기는 수동 gate 로 우회한다.
- 운영자에게 실제 쓰기를 허용하려면 `COS_LIVE_BINDING_WRITERS=1` 과 함께 해당 provider 의 토큰(예: `GITHUB_TOKEN`, `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`)을 `.env` 에 넣는다. 토큰이 없으면 `audit:bootstrap-readiness` 가 `fail_missing_prereq` 를 리턴한다.

## 지원 경계

- COS 본체 코드 외의 파트너 환경 이슈(네트워크·provider 정책·계정 제한) 는 human-gate 로 드러나지만 COS 가 대신 승인하지 않는다.
- 자동 upgrade/migration 파이프라인은 포함되지 않는다. 파트너가 버전 변경을 명시적으로 수행한다.
- Harness Quality Proof (W13-E): `npm run audit:harness-quality-proof --project-space-key <key>` 로 6축(리뷰 개입·재작업 루프·거짓완료 전 차단·gate reopen 일관성·artifact↔live 불일치·팀 형태별 결과) 관찰값을 확인할 수 있다. 증거가 없으면 null 로 떨어지며 광고성 주장은 하지 않는다.
