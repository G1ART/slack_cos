# BYO_KEYS_AND_INFRA — Design Partner Beta

## 원칙

이번 베타는 **Bring-Your-Own** 원칙을 따릅니다.

- provider 키는 파트너 소유.
- 런타임 인프라(호스팅·DB·로그 수집) 는 파트너 소유.
- COS 는 파트너 쪽에서 실행되는 코드 베이스이며, 중앙 서버가 대신 쓰기를 수행하지 않습니다.

## 금지 사항

- **파트너 키 공유 금지.** COS 개발팀이 파트너의 provider 키/토큰을 수령·저장하지 않습니다. 긴급 이슈가 있어도 key 를 공유받지 않고 로그/메타데이터로 재현합니다.
- **공통 풀(shared pool) 금지.** 한 파트너가 쓰는 provider 계정을 다른 파트너가 재사용할 수 없습니다.
- **secret 값 저장 금지.** `propagation_runs.secret_source_graph_snapshot_json` 에는 value 가 아닌 메타(value_name, source_kind, sink_targets, write_policy 등) 만 담깁니다.

## BYO 인프라 권장 조합

1. 런타임: Railway / Fly / 자체 k8s — 단일 프로세스
2. 상태 저장: 파트너 소유 Supabase 프로젝트 + `supabase/migrations/` 의 모든 DDL 적용
3. 로그: 파트너 수집 경로 (Grafana/Datadog 등). COS 는 stdout/structured 를 그대로 뿜는다.
4. Secret 저장: 파트너 선택(vault/doppler/1password/플랫폼 native). COS 는 런타임 env var 로만 접근.

## 역할 분담

| 책임 | 파트너 | COS 코드 |
| --- | --- | --- |
| 프로세스 가동/종료 | O | - |
| provider 키 보관/순환 | O | - |
| Supabase migration 적용 | O | migration 파일 제공 |
| qualification 데이터 축적 | O | CLI/runtime 제공 |
| capability fail-closed | - | O |
| human-gate 자연어 안내 | - | O |
| 감사용 secret graph 메타 | - | O |

## 핵심 의무

- 파트너는 provider 계정 약관 준수를 책임집니다. COS 는 provider 정책 변화로 인한 제한을 human-gate 로 표면화만 합니다.
- 파트너는 Supabase 접근 감사 책임을 집니다. COS 는 row-level 보장 없이 `project_space_key` 단위로만 격리를 표현합니다.
