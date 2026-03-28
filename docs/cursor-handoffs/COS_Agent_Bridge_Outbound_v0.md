# COS Agent Bridge (아웃바운드) v0

**권위:** 실행 패치 메모 — 제품 헌법 아님. 코드 정본: `src/features/agentBridgeOutbound.js`, `runInboundStructuredCommands.js` 내 `fireAgentBridgeNotify` 호출.

## 목적

슬랙 COS가 **_커서발행·이슈발행·수파베이스발행_**에 성공한 직후, **외부 에이전트 런타임**(L2 릴레이 → **Cursor Cloud / GitHub 트리거 / CI** 등)으로 **JSON을 POST**해 자동화를 시작할 수 있게 한다.  
**실행 주체를 로컬 IDE가 아니라 클라우드 worker로 둔다**는 전제는 **`COS_Execution_Worker_Layer_CloudFirst_v1.md`** 참고.  
인바운드 증거는 기존 **`POST /cos/ci-proof`**(`COS_CI_HOOK_*`)로 AWQ에 `proof_refs`를 붙이는 흐름을 재사용하면 된다.

## 환경 변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `COS_AGENT_BRIDGE_URL` | 예 | 전송 안 함이면 비우거나 미설정 |
| `COS_AGENT_BRIDGE_SECRET` | 아니오 | 설정 시 요청 헤더 `X-COS-Agent-Bridge-Secret` 동일 값 |
| `COS_BRIDGE_INSTANCE_ID` | 아니오 | 페이로드 `cos_instance` (기본 `default`) |

## 트리거

성공 응답 직전, **한 번씩** `fireAgentBridgeNotify`(fire-and-forget):

- `tool: 'cursor'` — 핸드오프 마크다운(길이 상한)·경로·WRK/RUN·`awq_id`·repo 힌트 등
- `tool: 'github'` — issue URL/번호·repo·payload 요약
- `tool: 'supabase'` — `db_scope`·dispatch payload·sql_preview 요약

공통: `event: 'tool_dispatch'`, `version: 1`, `emitted_at`, `slack` 채널/유저(있을 때), `env_key`.

## 수신 측 최소 구현

1. POST 본문 JSON 파싱
2. `X-COS-Agent-Bridge-Secret` 검증(서버에서 설정한 경우)
3. `tool` 분기 후 로컬 Cursor CLI·GitHub API·Supabase MCP 등 실행
4. 결과는 COS로 **`COS_CI_HOOK_SECRET` + `work_queue_id` 또는 `run_id` + `proof`** 로 회신하거나, 슬랙 봇이 `커서결과기록` 등을 보내도록 구성

## 보안

- 브리지 URL은 **비공개 엔드포인트** + TLS 권장
- 시크릿은 헤더만 쓰지 말고 **수신 서비스에서 반드시 검증**

## 회귀

`scripts/test-agent-bridge-outbound.mjs` — 로컬 HTTP 서버로 POST 1회 수신 확인 (`npm test` 포함).
