/**
 * vNext.13.3 — 창업자 면 완료/클로저 문구는 truth_reconciliation 정본만 기준으로 고정한다.
 * 레인·라우팅 휴리스틱으로 “완료”를 단정하지 않는다.
 */

/**
 * @param {{ overall_status?: string, completion_source?: string } | null} eval_
 * @param {{ hasTruthEntries: boolean }} opts
 * @returns {{ founder_phrase: string, founder_closure_label: string, internal_note?: string }}
 */
export function founderTruthClosureWording(eval_, opts) {
  const hasTruth = Boolean(opts?.hasTruthEntries);
  if (!hasTruth) {
    return {
      founder_closure_label: 'unsatisfied',
      founder_phrase:
        '아직 미완료 — `truth_reconciliation` 정본이 없어 완료 여부를 단정하지 않습니다. 디스패치·정본이 쌓인 뒤 다시 물어 주세요.',
      internal_note: 'no_truth_reconciliation_entries',
    };
  }

  const st = eval_?.overall_status || 'pending';
  /** @type {Record<string, { label: string; phrase: string }>} */
  const map = {
    completed: {
      founder_closure_label: 'satisfied',
      founder_phrase:
        '완료 — 정본(`truth_reconciliation`)상 필요한 경로가 충족된 것으로 보입니다. (에이전트 서술이 아니라 툴 ref 기준)',
    },
    draft_only: {
      founder_closure_label: 'draft_only',
      founder_phrase:
        '초안만 준비됨 — 실제 실행 증거는 초안·관측 단계에 머물러 있습니다. ref가 채워지면 정본이 올라갑니다.',
    },
    observe_only: {
      founder_closure_label: 'draft_only',
      founder_phrase:
        '초안만 준비됨 — 관측·초안 위주로만 정본에 잡혀 있습니다. 실행 증거를 더 쌓아야 합니다.',
    },
    partial: {
      founder_closure_label: 'partial',
      founder_phrase:
        '일부만 확인됨 — 일부 경로만 정본 기준을 충족했습니다. 나머지 ref·경로를 확인해 주세요.',
    },
    failed: {
      founder_closure_label: 'unsatisfied',
      founder_phrase: '아직 미완료 — 정본상 미충족·실패로 표시된 경로가 있습니다.',
    },
    manual_blocked: {
      founder_closure_label: 'unsatisfied',
      founder_phrase: '아직 미완료 — 수동 조치·의사결정이 필요합니다.',
    },
    running: {
      founder_closure_label: 'unsatisfied',
      founder_phrase: '아직 미완료 — 정본 판정이 진행 중이거나 열린 경로가 남아 있습니다.',
    },
    pending: {
      founder_closure_label: 'unsatisfied',
      founder_phrase: '아직 미완료 — 정본 엔트리는 있으나 전체 상태가 대기로 남아 있습니다.',
    },
  };

  const row = map[st] || map.pending;
  return {
    founder_closure_label: row.founder_closure_label,
    founder_phrase: row.founder_phrase,
    completion_source: eval_?.completion_source || null,
  };
}
