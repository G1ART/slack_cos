# Cloud Single-Runtime + Build SHA Diagnostics (2026-03-28)

**Authority:** Runtime truth (코드 기준 2026-03-28)  
**Purpose:** 어떤 코드가 Slack에 응답하는지 1초 만에 확인 가능하도록 함.

---

## 1. 단일 클라우드 런타임 — Source of Truth

- 로컬 `npm start`는 **개발·테스트 전용**. 프로덕션 Slack 응답은 클라우드 인스턴스 1개만 담당.
- Socket Mode(WSS)이므로 퍼블릭 URL / Slack Events webhook 불필요.
- 클라우드 인스턴스와 로컬 `npm start` **동시 실행 금지** — 같은 `SLACK_APP_TOKEN`으로 소켓 2개가 붙으면 메시지가 랜덤 분산됨.

## 2. 빌드 SHA 확인 방법

### 2a. 부팅 배너
```
[G1COS BOOT] sha=abc1234 branch=main pid=12345 started_at=... runtime=hosted hostname=...
[G1COS BOOT] model=gpt-5.4 intake_persist=1 fast_spec_promote=0
```

### 2b. Slack 에서 확인
- DM/멘션: **`버전`** 또는 **`version`** 또는 **`runtime status`**
- 슬래시: **`/g1cos version`**
- 응답에 `sha`, `branch`, `started_at`, `pid`, `hostname`, `runtime_mode`, `intake_persist` 포함.

### 2c. 환경 변수 우선순위 (SHA)
`RELEASE_SHA` → `GIT_SHA` → `VERCEL_GIT_COMMIT_SHA` → `RENDER_GIT_COMMIT` → `RAILWAY_GIT_COMMIT_SHA` → `FLY_IMAGE_REF` → `git rev-parse HEAD` fallback.

## 3. 라우트 진단 로그

모든 Slack 인바운드 요청:
```
[G1COS ROUTE BEGIN] sha=... thread_key=... source=... channel=... user=... active_intake=... text="..."
[G1COS ROUTE END] sha=... responder=... via=... response_type=... council_blocked=...
```

- 턴2가 `executive_surface` 인지 `council` 인지 로그에서 즉시 확인 가능.
- `active_intake`이 true인데 responder가 council이면 **라우팅 버그**.

## 4. 클라우드 필수 환경 변수

| 변수 | 용도 |
|------|------|
| `SLACK_BOT_TOKEN` | Slack Bot |
| `SLACK_SIGNING_SECRET` | Slack 서명 |
| `SLACK_APP_TOKEN` | Socket Mode |
| `OPENAI_API_KEY` | LLM |
| `PROJECT_INTAKE_SESSION_PERSIST` | `1` (필수) |
| `RELEASE_SHA` | 빌드 SHA (CI에서 주입; 없으면 git fallback) |
| `RUNTIME_MODE` | `hosted` 또는 생략(로컬은 `local`) |
| 기존 `.env` 의 나머지 | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STORAGE_MODE`, `STORE_READ_PREFERENCE` 등 레포 관례대로 |

## 5. 배포 절차

```bash
# 1. 로컬 봇 종료
# 터미널에서 Ctrl-C 또는: kill $(lsof -ti:3000) 등

# 2. 푸시
cd /Users/hyunminkim/g1-cos-slack
git add -A && git commit -m "deploy: cloud single-runtime + build diagnostics" && git push origin "$(git branch --show-current)"

# 3. 클라우드 (Railway / Render / Fly / 등) — 환경변수 세팅 후 deploy
#    Start command: npm start
#    Build command: npm install (node_modules)
```

## 6. 검증 순서

1. 클라우드 로그에서 `[G1COS BOOT] sha=...` 확인 (배포한 커밋과 일치)
2. Slack에서 **`버전`** → SHA·hostname이 클라우드 것
3. **`툴제작: 더그린 갤러리 캘린더 만들자`** (턴1) → 킥오프 표면
4. **`MVP 가정 정확. 개인/팀 일정 우선. 반복 필요. 승인 규칙 3종. 진행해줘.`** (턴2)
   - 로그: `[G1COS ROUTE END] sha=... responder=executive_surface` 이어야 함
   - Council 시그니처 없어야 함
5. 로그에 `responder=council`이 나오면 → 라우팅 버그 (다음 패치에서 고침)

## 7. 다음 패치

- 클라우드에서 **라우트 진실**이 확보된 뒤에만 Council suppression 구조 변경 착수.
- `[G1COS ROUTE END]` 로그로 정확히 어디서 Council 경로에 진입하는지 판별 → root cause fix.
