-- W12-B — propagation_runs 에 secret source-of-truth graph snapshot 컬럼 추가.
--
-- 정본: docs/cursor-handoffs/W12_LIVE_QUALIFICATION_AND_PACKAGING_PLANMODE_MASTER_INSTRUCTION_2026-04-16.md §3 Slice B.
--
-- secret_source_graph_snapshot_json 은 값(secret) 을 포함하지 않는 메타 그래프만 저장한다.
-- raw value / token / decrypted credential / credentialized URL 은 기록 금지 (애플리케이션 레이어에서 가드).

alter table public.propagation_runs
  add column if not exists secret_source_graph_snapshot_json jsonb;

comment on column public.propagation_runs.secret_source_graph_snapshot_json is
  'W12-B: 값(secret) 제외 메타 그래프 snapshot. raw value/token 저장 금지. 감사/재현 근거 용도.';
