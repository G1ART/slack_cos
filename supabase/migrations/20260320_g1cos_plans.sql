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
