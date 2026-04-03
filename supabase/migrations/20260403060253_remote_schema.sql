drop extension if exists "pg_net";

alter table "public"."g1cos_approvals" alter column "created_at" drop default;

alter table "public"."g1cos_approvals" alter column "status" set not null;

alter table "public"."g1cos_environment_context" alter column "value" drop default;

alter table "public"."g1cos_project_context" alter column "value" drop default;

alter table "public"."g1cos_work_items" alter column "created_at" drop default;

alter table "public"."g1cos_work_items" alter column "project_key" set not null;

alter table "public"."g1cos_work_items" alter column "status" set not null;

alter table "public"."g1cos_work_items" alter column "tool_key" set not null;

alter table "public"."g1cos_work_runs" alter column "created_at" drop default;

alter table "public"."g1cos_work_runs" alter column "project_key" set not null;

alter table "public"."g1cos_work_runs" alter column "status" set not null;

alter table "public"."g1cos_work_runs" alter column "tool_key" set not null;

CREATE INDEX idx_g1cos_approvals_category ON public.g1cos_approvals USING btree (approval_category);

CREATE INDEX idx_g1cos_work_runs_qa_status ON public.g1cos_work_runs USING btree (qa_status);

CREATE INDEX idx_g1cos_work_runs_result_status ON public.g1cos_work_runs USING btree (result_status);

CREATE INDEX idx_g1cos_work_runs_status ON public.g1cos_work_runs USING btree (status);

CREATE UNIQUE INDEX ux_g1cos_approvals_approval_key ON public.g1cos_approvals USING btree (approval_key) WHERE (approval_key IS NOT NULL);

alter table "public"."g1cos_work_runs" add constraint "g1cos_work_runs_work_id_fkey" FOREIGN KEY (work_id) REFERENCES public.g1cos_work_items(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."g1cos_work_runs" validate constraint "g1cos_work_runs_work_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.g1cos_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;


