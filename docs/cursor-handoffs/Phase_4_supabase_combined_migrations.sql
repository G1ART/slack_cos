-- Phase_4_supabase_combined_migrations.sql — Supabase SQL Editor 한 번에 실행용
-- (소스: supabase/migrations/20260319 + 20260320 연결본)
--
-- G1 COS live core tables (dual-write + Supabase read preference 대상)
-- Apply before 20260320_g1cos_plans.sql (또는 plans만 별도여도 무방).
-- Service role만 사용 시 RLS는 차단용. anon/authenticated 정책 없음.
-- work_runs.work_id FK 없음: 백필·레거시 호환.

CREATE OR REPLACE FUNCTION public.set_g1cos_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ── work_items ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.g1cos_work_items (
  id text PRIMARY KEY,
  project_key text,
  tool_key text,
  work_type text,
  status text,
  priority text,
  owner_type text,
  assigned_persona text,
  assigned_tool text,
  approval_required boolean NOT NULL DEFAULT false,
  approval_status text,
  branch_name text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_g1cos_work_items_project_key ON public.g1cos_work_items (project_key);
CREATE INDEX IF NOT EXISTS idx_g1cos_work_items_status ON public.g1cos_work_items (status);
CREATE INDEX IF NOT EXISTS idx_g1cos_work_items_approval_status ON public.g1cos_work_items (approval_status);
CREATE INDEX IF NOT EXISTS idx_g1cos_work_items_assigned_persona ON public.g1cos_work_items (assigned_persona);
CREATE INDEX IF NOT EXISTS idx_g1cos_work_items_updated_at ON public.g1cos_work_items (updated_at DESC);

DROP TRIGGER IF EXISTS trg_g1cos_work_items_updated_at ON public.g1cos_work_items;
CREATE TRIGGER trg_g1cos_work_items_updated_at
  BEFORE UPDATE ON public.g1cos_work_items
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_g1cos_updated_at();

-- ── work_runs ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.g1cos_work_runs (
  run_id text PRIMARY KEY,
  work_id text NOT NULL,
  project_key text,
  tool_key text,
  adapter_type text,
  status text,
  qa_status text,
  result_status text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_g1cos_work_runs_work_id ON public.g1cos_work_runs (work_id);
CREATE INDEX IF NOT EXISTS idx_g1cos_work_runs_updated_at ON public.g1cos_work_runs (updated_at DESC);

DROP TRIGGER IF EXISTS trg_g1cos_work_runs_updated_at ON public.g1cos_work_runs;
CREATE TRIGGER trg_g1cos_work_runs_updated_at
  BEFORE UPDATE ON public.g1cos_work_runs
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_g1cos_updated_at();

-- ── approvals ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.g1cos_approvals (
  id text PRIMARY KEY,
  status text,
  approval_key text,
  approval_category text,
  priority_score numeric,
  channel_sensitivity text,
  channel_context text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_g1cos_approvals_status ON public.g1cos_approvals (status);
CREATE INDEX IF NOT EXISTS idx_g1cos_approvals_updated_at ON public.g1cos_approvals (updated_at DESC);

DROP TRIGGER IF EXISTS trg_g1cos_approvals_updated_at ON public.g1cos_approvals;
CREATE TRIGGER trg_g1cos_approvals_updated_at
  BEFORE UPDATE ON public.g1cos_approvals
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_g1cos_updated_at();

-- ── object_map (project / environment context) ────────────
CREATE TABLE IF NOT EXISTS public.g1cos_project_context (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.g1cos_environment_context (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_g1cos_project_context_updated_at ON public.g1cos_project_context;
CREATE TRIGGER trg_g1cos_project_context_updated_at
  BEFORE UPDATE ON public.g1cos_project_context
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_g1cos_updated_at();

DROP TRIGGER IF EXISTS trg_g1cos_environment_context_updated_at ON public.g1cos_environment_context;
CREATE TRIGGER trg_g1cos_environment_context_updated_at
  BEFORE UPDATE ON public.g1cos_environment_context
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_g1cos_updated_at();

ALTER TABLE public.g1cos_work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.g1cos_work_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.g1cos_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.g1cos_project_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.g1cos_environment_context ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.g1cos_work_items IS 'G1 COS work items; document in payload';
COMMENT ON TABLE public.g1cos_work_runs IS 'G1 COS work runs';
COMMENT ON TABLE public.g1cos_approvals IS 'G1 COS approvals';
-- Phase 4: plans SSOT in Supabase (payload JSON + query-friendly columns)
-- Apply after core tables exist. Service role used by app bypasses RLS.

CREATE TABLE IF NOT EXISTS public.g1cos_plans (
  plan_id text PRIMARY KEY,
  status text,
  approval_required boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS g1cos_plans_updated_at_idx ON public.g1cos_plans (updated_at DESC);
CREATE INDEX IF NOT EXISTS g1cos_plans_status_idx ON public.g1cos_plans (status);

ALTER TABLE public.g1cos_plans ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated; app uses service_role only.

COMMENT ON TABLE public.g1cos_plans IS 'G1 COS plans; full document in payload, plan_id/status mirrored for filters';
