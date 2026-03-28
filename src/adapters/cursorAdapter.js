export function prepareDispatch(workItem) {
  return [
    '# Cursor Packet',
    '',
    '1. 작업 목표',
    `- ${workItem.title}`,
    `- ${workItem.brief}`,
    '',
    '2. 프로젝트/도구/업무 정보',
    `- project_key: ${workItem.project_key}`,
    `- tool_key: cursor`,
    `- work_id: ${workItem.id}`,
    `- work_type/priority: ${workItem.work_type} / ${workItem.priority}`,
    '',
    '3. 현재 컨텍스트',
    `- assigned_persona: ${workItem.assigned_persona}`,
    `- dependencies: ${(workItem.dependencies || []).join(', ') || '없음'}`,
    `- acceptance_criteria: ${(workItem.acceptance_criteria || []).join(' | ') || '없음'}`,
    '',
    '4. 수정/검토 대상',
    '- 관련 파일을 먼저 읽고 최소 침습으로 수정',
    '- 기존 명령/플로우 호환성 유지',
    '',
    '5. 절대 하지 말 것',
    '- 외부 API 자동 호출 추가 금지',
    '- scheduler/automation 추가 금지',
    '- 기존 approval/brief/work 명령 훼손 금지',
    '',
    '6. 완료 조건',
    '- 요구 기능이 Slack 명령으로 동작',
    '- 기존 기능 회귀 없음',
    '',
    '7. 테스트 요구',
    '- 최소 구문체크 및 핵심 명령 시나리오 점검',
    '- 변경 영향 파일 lint 확인',
    '',
    '8. 결과 보고 형식',
    '1. 변경한 파일 목록',
    '2. 핵심 변경 사항',
    '3. 테스트 실행 결과',
    '4. 남은 리스크 / 미해결 사항',
    '5. 후속 권장 작업',
    '6. handoff/doc 업데이트 여부',
    '',
    '9. handoff/doc 업데이트 요구',
    '- 동작 변경이 있으면 handoff 문서 반영 여부를 명시',
  ].join('\n');
}

export function createRun(workItem, metadata = {}) {
  return {
    project_key: workItem.project_key,
    tool_key: 'cursor',
    adapter_type: 'cursor_adapter',
    dispatch_payload: prepareDispatch(workItem),
    dispatch_target: metadata.dispatch_target || 'cursor_manual_paste',
    executor_type: 'cursor',
    executor_session_label: metadata.executor_session_label || null,
    created_by: metadata.user || null,
    notes: metadata.note || '',
  };
}

export function formatDispatchForSlack(run) {
  return [
    `실행 ID: ${run.run_id}`,
    `업무 ID: ${run.work_id}`,
    `프로젝트: ${run.project_key}`,
    `도구: ${run.tool_key}`,
    `현재 상태: ${run.status}`,
    '',
    '[payload preview]',
    String(run.dispatch_payload || '').slice(0, 1800),
    '',
    '다음 권장 액션: 실행중/실행상세로 추적하고 결과를 notes 또는 result로 남기세요.',
  ].join('\n');
}

export function parseResultIntake(text) {
  const raw = String(text || '');
  const lines = raw.split('\n').map((l) => l.trim());
  const changed_files = lines
    .filter((l) => /^[-*]\s+/.test(l) && /\/|\./.test(l))
    .map((l) => l.replace(/^[-*]\s+/, '').trim())
    .slice(0, 40);
  const tests_run = lines.filter((l) => /test|테스트|npm|pnpm|pytest|jest|vitest/i.test(l)).slice(0, 20);
  const lower = raw.toLowerCase();
  const tests_passed = /(pass|통과|성공)/i.test(lower)
    ? true
    : /(fail|실패|에러|error)/i.test(lower)
    ? false
    : null;
  const unresolved_risks = lines
    .filter((l) => /^[-*]\s+/.test(l) && /리스크|미해결|unresolved/i.test(l))
    .map((l) => l.replace(/^[-*]\s+/, '').trim())
    .slice(0, 20);
  const blockers = lines
    .filter((l) => /^[-*]\s+/.test(l) && /block|막힘|차단|의존/i.test(l))
    .map((l) => l.replace(/^[-*]\s+/, '').trim())
    .slice(0, 20);
  const handoff_updated = /(handoff|doc).*(yes|true|완료|업데이트)/i.test(lower)
    ? true
    : /(handoff|doc).*(no|false|미반영|안함)/i.test(lower)
    ? false
    : null;
  return { changed_files, tests_run, tests_passed, unresolved_risks, blockers, handoff_updated };
}

export function formatReviewForSlack(run) {
  return [
    `대표 검토 요약 (${run.run_id})`,
    `- work_id: ${run.work_id}`,
    `- result_status/qa_status: ${run.result_status || 'none'} / ${run.qa_status || 'pending'}`,
    `- changed_files: ${(run.changed_files || []).length}개`,
    `- tests_passed: ${run.tests_passed === null ? '미기재' : run.tests_passed ? '예' : '아니오'}`,
    `- unresolved_risks: ${(run.unresolved_risks || []).join(' | ') || '없음'}`,
    `- blockers: ${(run.blockers || []).join(' | ') || '없음'}`,
    `- handoff_updated: ${run.handoff_updated === null ? '미기재' : run.handoff_updated ? '예' : '아니오'}`,
  ].join('\n');
}

export function formatResultForSlack(run) {
  return [
    `실행 결과 (${run.run_id})`,
    `- 상태: ${run.status}`,
    `- 요약: ${run.result_summary || '없음'}`,
    `- 링크: ${run.result_link || '없음'}`,
    `- 에러: ${run.error_summary || '없음'}`,
  ].join('\n');
}
