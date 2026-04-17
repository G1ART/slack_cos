# OPERATOR_SMOKE_TEST_CHECKLIST — Design Partner Beta

파트너 환경에 COS 를 처음 올릴 때 운영자가 따라 밟는 스모크 체크리스트입니다. 모든 단계는 **파트너 인프라에서 수행**하며, COS 개발팀이 파트너 계정에 접근하지 않습니다.

## 0. 사전 점검

- [ ] `.env` 파일이 준비되어 있고 (`.env.example` 기준) 필수 키가 채워져 있다.
- [ ] Supabase 를 쓰는 경우 `supabase/migrations/` 전부(특히 W12-B 스냅샷 컬럼 추가 마이그레이션) 가 적용되어 있다.
- [ ] `npm install` 완료.

## 1. 필독 문서 매니페스트

- [ ] `npm run preflight:design_partner_beta_qualification` 가 에러 없이 통과한다.
- [ ] `npm run verify:preflight:design_partner_beta_qualification` 가 ack SHA 를 모두 확인한다.

## 2. 프로세스 기동

- [ ] `npm run start` 가 Slack Socket Mode 에 붙고 `cos_runtime_truth` 부트 로그가 출력된다.
- [ ] 부트 로그의 `cos_parcel_deployment_key`, `workspace_key`, `product_key`, `project_space_key` 가 의도한 값이다.
- [ ] Slack 에서 봇을 mention 하면 founder thread 가 열리고 “accepted” 표면을 수신한다.

## 3. 최소 1개 sink 자격 검증

- [ ] `node scripts/qualify-live-binding-capability.mjs --sink github --mode live --verified-by <email>` 를 실행해 GitHub 를 `live_verified` 로 올린다.
- [ ] `ops/live_binding_capability_qualifications.json` 이 생성되었고, raw token 이 포함되어 있지 않다.
- [ ] 다른 sink 는 최소 `--mode fixture` 로 한 번 호출해 `fixture_verified` 로 남겨 둔다.

## 4. Delivery readiness 감사

- [ ] `node scripts/audit-delivery-readiness.mjs --project-space-key <key> --json` 이 `verdict` 로 `ready` 또는 `needs_verification` 중 하나를 반환한다.
- [ ] `secret_source_graph_compact_lines` 에 raw value / URL / 토큰이 보이지 않는다.
- [ ] `capability_verification_lines` 가 비어 있지 않다면 이유가 자연어로 설명된다.

## 5. Human-gate 경로

- [ ] 의도적으로 1개 binding 을 제공자 정책상 수동이 필요한 sink(예: Slack bot token, OpenAI key) 로 밀어 본다.
- [ ] Slack 표면에 사람 승인을 요청하는 짧은 한국어 안내가 뜬다(어디서·무엇을·이어받기).
- [ ] gate 를 해결하면 동일 thread 에서 이어받기 동작이 확인된다.

## 6. Scenario 2 bounded 제출 경계

- [ ] `COS_SCENARIO_LIVE_OPENAI=1` + live rehearsal 조건으로 scenario 2 러너를 호출한다.
- [ ] 번들이 만들어져도 자동 제출되지 않고 `bundle:manual_submission_gate` 에서 멈춘다.
- [ ] 스코어카드의 `capability_mismatch_counts` 가 의도와 일치한다(미검증 sink 가 있다면 > 0).

## 7. 종료 정리

- [ ] 프로세스 종료 시 Supabase 에 남은 미종결 run / human gate 가 없는지 `cos_runs` / `project_space_human_gates` 에서 확인한다.
- [ ] `ops/` 하위 ledger 파일은 파트너 내부 저장소로만 백업한다(원격 저장소 공유 금지).

문제 발생 시 `docs/design-partner-beta/KNOWN_HUMAN_GATE_POINTS.md` 를 먼저 확인하세요.
