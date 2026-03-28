export function prepareDispatch(workItem) {
  return {
    kind: 'docs_update_request',
    work_id: workItem.id,
    project_key: workItem.project_key,
    title: workItem.title,
    brief: workItem.brief,
    audience: 'internal',
    doc_type: 'handoff/runbook/spec',
  };
}

export function createRun(workItem, metadata = {}) {
  return {
    project_key: workItem.project_key,
    tool_key: 'docs',
    adapter_type: 'docs_adapter',
    dispatch_payload: prepareDispatch(workItem),
    dispatch_target: metadata.dispatch_target || 'docs_manual_paste',
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
    JSON.stringify(run.dispatch_payload, null, 2).slice(0, 900),
    '',
    '다음 권장 액션: 문서 반영 후 링크를 result_link로 남기세요.',
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
