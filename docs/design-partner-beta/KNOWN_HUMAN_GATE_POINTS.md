# KNOWN_HUMAN_GATE_POINTS — Design Partner Beta

이 베타에서 **자동화가 끝나고 사람이 반드시 개입해야 하는 지점**을 한 자리에 모아둔 문서입니다. 파트너가 “왜 멈췄지?” 를 물을 때 가장 먼저 참조합니다.

COS 는 이 게이트들을 `resolution_class`·`break_reason_cause` 같은 내부 토큰 대신 **자연어**로 founder 에게 안내합니다(W12-C human gate escalation contract 참고).

## Slack / OpenAI / GitHub / 외부 provider

| 상황 | 사람 조치 | 재개 경로 |
| --- | --- | --- |
| Slack bot/app token 재발급 | Slack app 콘솔에서 토큰 재생성 후 `.env` 에 반영, 프로세스 재시작 | 다음 mention 에서 이어받기 |
| OpenAI API key 교체/한도 초과 | OpenAI 계정에서 키 갱신 또는 한도 상향, `.env` 반영 | 다음 thread 에서 자동 재시도 |
| GitHub fine-grained PAT 권한 부족 | GitHub Settings → Developer settings → Fine-grained tokens 에서 필요한 repo scope 체크 후 `.env` 반영 | gate 해결 후 founder 가 thread 이어받기 |
| GitHub Actions secrets 직접 입력 | 저장소 Settings → Secrets and variables → Actions 에서 값 직접 추가 | 이어받기 thread 에서 재검증 |
| Vercel 토큰/권한 승인 | Vercel 대시보드에서 프로젝트 접근 권한 승인 | gate 해결 후 이어받기 |
| Railway deploy trigger | 이 베타에서는 artifact-only. 실제 deploy 는 Railway 대시보드에서 사람이 실행 | artifact 기록만 남고 자동 이어받기 없음 |
| Supabase schema migration | SQL editor 에서 해당 `.sql` 을 직접 실행 | 실행 후 COS 는 새 컬럼을 사용 |
| Cursor automation endpoint 미설정 | CLI fallback 또는 artifact mode. 설정하려면 endpoint/header 를 `.env` 에 주입 | 다음 thread 에서 재시도 |

## Scenario 2 bounded 제출 경계

- live rehearsal 모드에서 research → draft → review → bundle 까지 자동으로 진행하지만, **최종 제출 단계는 항상 수동** 입니다(W12-D).
- COS 는 bundle 객체를 founder 에게 전달하고 `bundle:manual_submission_gate` 로 멈춥니다.
- 운영자가 내용을 확인한 뒤 외부 시스템에 직접 제출합니다.

## Capability qualification

- `scripts/qualify-live-binding-capability.mjs` 결과가 `live_verified` 가 아닌 sink 는 **실제 live write 를 수행하지 않습니다**.
- `stale`, `unverified`, `verification_failed` 상태도 동일하게 fail-closed 됩니다.
- 재검증은 동일 CLI 로 `--mode live` 재실행하면 됩니다. 실패 시 `verification_notes` 에 짧은 사유가 남습니다(시크릿 제외).

## Secret 값 다루기

- 어떤 경우에도 **raw secret 값은 founder 표면·audit 출력·DB 컬럼에 들어가지 않습니다**(W12-B).
- 파트너가 값을 전달받아야 하는 상황이면 COS 는 “어디서 직접 입력해야 하는지” 만 안내합니다.

## Human-gate 을 줄이기 위한 다음 단계

- 각 provider 의 OAuth 앱 등록 및 bot-wide 인증 흐름은 향후 `W13+` 범위입니다.
- 이 베타에서는 **정직한 한계 표시 + 이어받기 경로 유지** 를 목표로 합니다.
