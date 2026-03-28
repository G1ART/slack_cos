# G1.ART Slack COS Deployment Readiness

## 목표
- 특정 플랫폼 종속 없이 local/hosted 공통 실행 구조 유지
- 상시 실행(runtime) + 수동 자동화 job 실행 가능한 상태 확보

## 필수 환경변수
- `SLACK_BOT_TOKEN`
- `SLACK_SIGNING_SECRET`
- `SLACK_APP_TOKEN`
- `OPENAI_API_KEY`
- 선택: `OPENAI_MODEL`, `RUNTIME_MODE`

## 런타임 모드
- `RUNTIME_MODE=local` 또는 `hosted`
- 미지정 시 `NODE_ENV=production`이면 hosted, 아니면 local

## Startup 체크
1. env validation 통과
2. JSON 저장소 파일 생성/복구
3. health snapshot 출력(approval/work/run 카운트)
4. Slack app start

## Graceful Shutdown
- `SIGINT`, `SIGTERM` 수신 시:
  - Slack app stop
  - 종료 로그 출력
  - process 종료

## 운영 명령 점검
- `상태점검`
- `환경점검`
- `아침브리프`
- `저녁정리`
- `승인대기요약`
- `막힘업무요약`
- `주간회고`
- `자동화설정`
- `자동화켜기 <job_name>`
- `자동화끄기 <job_name>`

## Hosted 이전 체크리스트
- [ ] 필수 env 주입 확인
- [ ] `data/*.json` 파일 권한/영속성 확인
- [ ] 로그 수집 경로 확인(stdout 기반)
- [ ] 앱 재시작 정책(프로세스 매니저) 확인
- [ ] 상태점검/환경점검 명령 정상 동작
- [ ] 핵심 운영 명령(업무/실행/승인) 회귀 테스트 완료

## local / hosted 차이
- `local`: 개발/테스트에 적합. 내부 실험 및 수동 검증 중심.
- `hosted`: 외부에서 상시 실행되는 운영 모드. env 누락, 파일 저장소/권한 문제, 런타임 설정이 생기면 job 실행 전반이 막힐 수 있음.

## dev / staging / prod 운영 원칙
- `dev`: 로컬 검증 중심(낮은 risk level), 빠른 실험 허용.
- `staging`: 실제 운영에 가까운 통제 환경. destructive change는 제한적으로(리뷰/QA 강화).
- `prod`: 운영 환경. 강한 risk level과 승인 게이트 우선.

## project ↔ repo ↔ db 매핑 예시
- 저장소/DB는 `repo-registry.json` / `supabase-registry.json`에 project+env 기반으로 매핑됩니다.
- lookup 규칙:
  1) `work item`에 명시된 값(`repo_key`, `db_scope`) 우선
  2) 없으면 `project key` + 현재 env profile 기준으로 repo/db resolve
  3) env 매핑이 없으면 default resolve
  4) 둘 다 없으면 manual fallback

예:
- `project=abstract`, `env=dev` → `repo=g1art-abstract`, `db=abstract-dev`
- `project=slack_cos`, `env=prod` → `repo=g1-cos-slack`, `db=slack-cos-prod`

## branch naming convention
- branch prefix rule은 `environment-profiles.json`의 `branch_prefix_rules`를 따릅니다.
- 기본 예시:
  - bug → `fix/*`
  - feature → `feat/*`
  - refactor → `refactor/*`
  - ops → `chore/*`
  - data → `data/*`

## 배포 전 체크리스트
1. 필수 env 존재 확인 (`환경점검`)
2. runtime 모드/파일 저장소 확인 (`상태점검`)
3. repo/db 매핑 확인 (`배포준비점검`)
4. automation settings 상태 확인 (`자동화설정`)
5. 운영 명령 회귀 테스트
   - `아침브리프`, `저녁정리`, `승인대기요약`, `막힘업무요약`
   - `업무발행/커서발행/깃허브발행/수파베이스발행` 및 결과 `결과등록` 파이프라인

## 자동 연동 준비(실제 execute/webhook 연결 이전)
- Cursor/GitHub/Supabase “payload 생성 + 상태 추적 + 결과 intake + QA gate” 흐름이 먼저 안정화되어야 합니다.
- 다음 단계(이번 패치 범위 밖):
  - 실제 GitHub/Supabase/Cursor API execute
  - webhook receiver(결과 수신 서버)
  - 외부 scheduler/cron 연결
  - hosted vendor 종속 제거 검토(이미 vendor-agnostic 방향 유지)

## 이후 단계 (이번 패치 범위 밖)
- 외부 scheduler/cron 연결
- 외부 adapter 실제 API execute 단계 연결
- 영속 저장소(DB) 전환 검토
