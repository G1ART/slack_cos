export function prepareDispatch(workItem) {
  return [
    '[Manual Dispatch Memo]',
    `work_id=${workItem.id}`,
    `project=${workItem.project_key}`,
    `title=${workItem.title}`,
    `brief=${workItem.brief}`,
    `priority=${workItem.priority}`,
    `next=${(workItem.acceptance_criteria || []).join('; ') || 'acceptance 정의 필요'}`,
  ].join('\n');
}

export function createRun(workItem, metadata = {}) {
  return {
    project_key: workItem.project_key,
    tool_key: 'manual',
    adapter_type: 'manual_adapter',
    dispatch_payload: prepareDispatch(workItem),
    dispatch_target: metadata.dispatch_target || 'human_operator',
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
    String(run.dispatch_payload || '').slice(0, 900),
    '',
    '다음 권장 액션: 담당자 확인 후 실행중으로 전환하세요.',
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
