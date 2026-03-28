function safeTrim(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function slugify(text) {
  return safeTrim(text)
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 44);
}

function inferSupabaseKind(workItem) {
  if (workItem?.supabase_kind) return workItem.supabase_kind;
  const t = `${workItem?.title || ''} ${workItem?.brief || ''}`.toLowerCase();
  if (/(migration|migrate|add column|alter table)/.test(t)) return 'migration';
  if (/(policy|rls|row level security)/.test(t)) return 'policy';
  if (/(function|fn_|trigger|stored)/.test(t)) return 'function';
  if (/(data fix|data_fix|정정|수정|rows|row|데이터)/.test(t)) return 'data_fix';
  if (/(storage|bucket|path|rule)/.test(t)) return 'storage';
  return 'migration';
}

function makeSupabaseName(workItem, kind) {
  const slug = slugify(workItem?.title || workItem?.brief || 'task');
  const wt = workItem?.work_type || 'feature';

  if (kind === 'migration') {
    const prefix = wt === 'feature' ? 'add' : wt === 'bug' ? 'fix' : wt === 'refactor' ? 'refactor' : 'add';
    return `${prefix}_${slug}`;
  }
  if (kind === 'data_fix') {
    const prefix = wt === 'bug' ? 'fix' : 'fix';
    return `${prefix}_${slug}`;
  }
  if (kind === 'policy') {
    return `policy_${slug}`;
  }
  if (kind === 'function') {
    return `fn_${slug}`;
  }
  if (kind === 'storage') {
    return `storage_${slug}`;
  }
  return `${kind}_${slug}`;
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function ensureNonEmptyOrDefault(s, fallback) {
  const t = safeTrim(s);
  return t ? t : fallback;
}

export function prepareDispatch(workItem) {
  const kind = inferSupabaseKind(workItem);
  const db_scope = workItem.db_scope || workItem.project_key || null;

  const migration_name =
    safeTrim(workItem.migration_name) || (kind === 'migration' ? makeSupabaseName(workItem, 'migration') : makeSupabaseName(workItem, 'migration'));
  const function_name =
    safeTrim(workItem.function_name) || (kind === 'function' ? makeSupabaseName(workItem, 'function') : makeSupabaseName(workItem, 'function'));

  const table_targets = asArray(workItem.table_targets);
  const policy_targets = asArray(workItem.policy_targets);
  const storage_targets = asArray(workItem.storage_targets);

  if (kind === 'migration') {
    return {
      kind: 'supabase_migration_payload',
      project_key: workItem.project_key,
      db_scope,
      migration_name,
      goal: ensureNonEmptyOrDefault(workItem.brief, '마이그레이션 목표를 명확히 작성하세요.'),
      objects_affected: table_targets.length ? table_targets : [],
      proposed_sql_change_summary: ensureNonEmptyOrDefault(
        workItem.acceptance_criteria?.join(', ') || workItem.brief,
        '변경 요약을 작성하세요.'
      ),
      safety_constraints: [
        'rollback plan 포함',
        'verification query 수행 전 적용 보류',
        '문제 발생 시 되돌림 우선',
      ],
      rollout_plan: [
        '테스트/스테이징에서 마이그레이션 검증',
        '프로덕션 적용 전 최소 트래픽 영향 확인',
        '적용 후 verification query 실행',
      ],
      verification_checklist: [
        '스키마/제약조건 검증',
        '핵심 쿼리 동작 확인',
        '롤백 경로 존재 확인',
      ],
      rollback_plan: [
        'rollback migration/SQL 준비',
        '데이터 되돌림 확인(필요 시 백업)',
      ],
    };
  }

  if (kind === 'policy') {
    return {
      kind: 'supabase_policy_payload',
      project_key: workItem.project_key,
      db_scope,
      policy_targets: policy_targets.length ? policy_targets : table_targets,
      table: table_targets?.[0] || null,
      desired_access_behavior: ensureNonEmptyOrDefault(workItem.brief, '접근/권한 정책의 의도를 명확히 작성하세요.'),
      policy_impact: ensureNonEmptyOrDefault(workItem.acceptance_criteria?.join(', ') || workItem.brief, '영향 범위를 작성하세요.'),
      rls_risk_checklist: [
        '오버퍼미션(과도 권한) 없는가',
        '차단 누락(under-restriction) 없는가',
        '쿼리/조인 경로에서 누락 없는가',
      ],
      verification_query_checklist: [
        '대표 role 조합으로 접근 테스트',
        '실제 샘플 데이터로 read/write 검증',
      ],
    };
  }

  if (kind === 'function') {
    return {
      kind: 'supabase_function_payload',
      project_key: workItem.project_key,
      db_scope,
      function_name,
      input_output_expectation: ensureNonEmptyOrDefault(workItem.brief, '입력/출력/예외 조건을 명시하세요.'),
      side_effects: ['명시적 side effects만 허용(가능하면 none)', '트랜잭션/락 고려'],
      security_notes: [
        '권한/보안 컨텍스트 확인(RLS/SECURITY DEFINER 등)',
        '민감 데이터 노출 없음 확인',
      ],
      test_cases: [
        '정상 케이스',
        '경계 조건',
        '권한 없는 케이스',
      ],
    };
  }

  if (kind === 'data_fix') {
    return {
      kind: 'supabase_data_fix_payload',
      project_key: workItem.project_key,
      db_scope,
      mutation_scope: ensureNonEmptyOrDefault(workItem.brief, '수정 범위(어떤 데이터/조건)와 목적을 명확히 작성하세요.'),
      target_tables: table_targets.length ? table_targets : [],
      backup_restore_caution: [
        '적용 전 백업/롤백 경로 확보',
        '되돌림 시 데이터 정합성 검증',
      ],
      before_after_verification_queries: [
        '적용 전/후 count/샘플 쿼리',
        '정합성/제약조건 검증',
      ],
      rollback_plan: [
        '되돌림 SQL 또는 복원 절차 준비',
      ],
    };
  }

  if (kind === 'storage') {
    return {
      kind: 'supabase_storage_payload',
      project_key: workItem.project_key,
      db_scope,
      storage_targets: storage_targets.length ? storage_targets : [],
      expected_permission_behavior: ensureNonEmptyOrDefault(workItem.brief, '저장소 접근/권한 동작 기대치를 명시하세요.'),
      validation_steps: [
        '권한 없는 접근 테스트',
        '권한 있는 업로드/다운로드 검증',
        '경로/버킷 정합성 확인',
      ],
      rollback_plan: ['권한/규칙 되돌림 절차 준비'],
    };
  }

  return {
    kind: 'supabase_migration_payload',
    project_key: workItem.project_key,
    db_scope,
    migration_name,
    goal: ensureNonEmptyOrDefault(workItem.brief, '마이그레이션 목표를 명확히 작성하세요.'),
    objects_affected: [],
    proposed_sql_change_summary: ensureNonEmptyOrDefault(workItem.brief, '변경 요약을 작성하세요.'),
  };
}

export function createRun(workItem, metadata = {}) {
  const kind = inferSupabaseKind(workItem);
  const payload = prepareDispatch(workItem);
  const db_scope = workItem.db_scope || workItem.project_key || null;

  const migration_name =
    kind === 'migration' ? payload.migration_name : safeTrim(workItem.migration_name) || makeSupabaseName(workItem, 'migration');
  const function_name =
    kind === 'function' ? payload.function_name : safeTrim(workItem.function_name) || makeSupabaseName(workItem, 'function');

  const affected_objects =
    kind === 'migration'
      ? asArray(workItem.table_targets)
      : kind === 'policy'
        ? asArray(workItem.policy_targets)
        : kind === 'data_fix'
          ? asArray(workItem.table_targets)
          : kind === 'storage'
            ? asArray(workItem.storage_targets)
            : [];

  return {
    project_key: workItem.project_key,
    tool_key: 'supabase',
    adapter_type: 'supabase_adapter',
    dispatch_payload: payload,
    dispatch_target: metadata.dispatch_target || 'supabase_manual_paste',
    created_by: metadata.user || null,
    notes: metadata.note || '',
    executor_type: 'supabase',
    executor_session_label: metadata.executor_session_label || null,
    db_scope,
    migration_name,
    function_name,
    supabase_payload_kind: kind,
    supabase_status: 'drafted',
    sql_preview: safeTrim(metadata.sql_preview) || '',
    verification_summary: '',
    rollback_readiness: 'unknown',
    affected_objects,
  };
}

export function formatDispatchForSlack(run) {
  return [
    `실행 ID: ${run.run_id}`,
    `업무 ID: ${run.work_id}`,
    `프로젝트: ${run.project_key}`,
    `DB: ${run.db_scope || '없음'}`,
    `도구: ${run.tool_key}`,
    `현재 상태: ${run.status}`,
    '',
    '[payload preview]',
    JSON.stringify(run.dispatch_payload, null, 2).slice(0, 1800),
    '',
    '다음 권장 액션: SQL/검증/롤백 준비까지 진행 후 `결과등록 <run_id>: ...`로 회수하세요.',
  ].join('\n');
}

export function formatResultForSlack(run) {
  return [
    `실행 결과 (${run.run_id})`,
    `- 상태: ${run.status}`,
    `- supabase_status: ${run.supabase_status || 'none'}`,
    `- rollback_readiness: ${run.rollback_readiness || 'unknown'}`,
    `- verification_summary: ${run.verification_summary || '없음'}`,
    `- 변경된/영향 객체: ${(run.affected_objects || []).join(', ') || '없음'}`,
  ].join('\n');
}

function parseBulletList(text, predicate) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim());
  return lines
    .filter((l) => /^[-*]\s+/.test(l))
    .map((l) => l.replace(/^[-*]\s+/, '').trim())
    .filter((l) => l && predicate(l))
    .slice(0, 30);
}

export function parseSupabaseResultIntake(text) {
  const raw = String(text || '');
  const lower = raw.toLowerCase();

  const migration_name =
    raw.match(/(?:migration_name|Migration)\s*[:=]\s*([^\n\r]+)/i)?.[1]?.trim() || null;
  const function_name =
    raw.match(/(?:function_name|Function)\s*[:=]\s*([^\n\r]+)/i)?.[1]?.trim() || null;

  const rollback_readiness = (() => {
    if (/(rollback readiness|롤백.*준비)\s*[:=]?\s*ready/i.test(raw) || /roll back .*ready/i.test(lower)) return 'ready';
    if (/(rollback readiness|롤백.*준비)\s*[:=]?\s*not_ready/i.test(raw) || /(roll back|rollback).*(not_ready|미반영|불가)/i.test(lower)) return 'not_ready';
    if (/rollback\s*not\s*ready|롤백.*불가/i.test(lower)) return 'not_ready';
    return 'unknown';
  })();

  const verification_summary =
    raw.match(/(?:verification_summary|검증 요약)\s*[:=]\s*([\s\S]+?)(?:\n\n|$)/i)?.[1]?.trim() ||
    raw.match(/(?:검증|verification).*?(?:-|\n)([\s\S]+?)(?:\n\n|$)/i)?.[1]?.trim() ||
    '';

  const tests_run = parseBulletList(raw, (l) => /test|테스트|npm|pnpm|pytest|jest|vitest|run/i.test(l));
  const tests_passed = /(pass|통과|성공)/i.test(raw)
    ? true
    : /(fail|실패|에러|error)/i.test(raw)
      ? false
      : null;

  const affected_objects =
    parseBulletList(raw, (l) => /(table|tables|policy|function|schema|public\.|pg_|rls|bucket|path|storage)/i.test(l));

  const blockers = parseBulletList(raw, (l) => /(block|막힘|차단|blocker|의존)/i.test(l));
  const unresolved_risks = parseBulletList(raw, (l) => /(unresolved|미해결|risk|리스크)/i.test(l));

  const sql_preview =
    raw.match(/(?:sql_preview|SQL preview|SQL)\s*[:=]\s*([\s\S]{0,800})/i)?.[1]?.trim() ||
    raw.match(/```sql([\s\S]{0,800})```/i)?.[1]?.trim() ||
    '';

  const supabase_status = (() => {
    if (/rolled back|rolled_back|롤백/.test(lower)) return 'rolled_back';
    if (/rejected|거부|반려/.test(lower)) return 'rejected';
    if (/verified|검증|검증됨/.test(lower)) return 'verified';
    if (/applied|적용|적용됨/.test(lower)) return 'applied';
    if (/planned|계획/.test(lower)) return 'planned';
    if (/drafted|draft/.test(lower)) return 'drafted';
    return 'none';
  })();

  const kind =
    raw.match(/(?:supabase_payload_kind|kind)\s*[:=]\s*(migration|policy|function|data_fix|storage)/i)?.[1]?.toLowerCase() ||
    null;

  return {
    db_scope: undefined,
    migration_name,
    function_name,
    supabase_status,
    supabase_payload_kind: kind || undefined,
    sql_preview,
    affected_objects,
    tests_run,
    tests_passed,
    unresolved_risks,
    blockers,
    verification_summary: verification_summary.slice(0, 700),
    rollback_readiness,
  };
}

export function parseResultIntake(text) {
  return parseSupabaseResultIntake(text);
}

export function formatReviewForSlack(run) {
  return [
    `DB검토 요약 (${run.run_id})`,
    `- rollback_readiness: ${run.rollback_readiness || 'unknown'}`,
    `- supabase_status: ${run.supabase_status || 'none'}`,
    `- affected_objects: ${(run.affected_objects || []).join(', ') || '없음'}`,
    `- blockers: ${(run.blockers || []).length ? run.blockers.join(' | ') : '없음'}`,
  ].join('\n');
}
