/**
 * dialog 응답 하단 — 워크스페이스 큐(실행/피드백) 확인 버튼.
 * @see WRK-260326-01_workspace_queue_intake.md
 */

const GREETING_RE =
  /^(안녕|반가|고마워|감사|ㅎㅇ|hi\b|hello\b|thanks\b|ok\b|네\b|응\b|좋아\b)[^.!?\n]{0,20}$/i;

/**
 * 짧은 인사·확인만 오면 버튼 생략 (노이즈 감소).
 * @param {string} normalizedUserText
 */
export function shouldOfferWorkspaceQueueButtons(normalizedUserText) {
  if (process.env.SLACK_DIALOG_QUEUE_BUTTONS === '0') return false;
  const t = String(normalizedUserText || '').trim();
  if (t.length < 28) return false;
  if (GREETING_RE.test(t)) return false;
  if (/^실행\s*큐에\s|^고객\s*피드백|^실행큐\s*:|^고객\s*피드백\s*:/u.test(t)) return false;
  return true;
}

/**
 * @param {{ kind: 'spec_intake' | 'customer_feedback', body: string, tr?: number }} payload
 */
export function encodeDialogQueuePayload(payload) {
  const maxBody = 950;
  let body = String(payload.body || '').trim();
  let tr = payload.tr ? 1 : 0;
  if (body.length > maxBody) {
    body = body.slice(0, maxBody);
    tr = 1;
  }
  const o = { v: 1, kind: payload.kind, body, tr };
  let s = JSON.stringify(o);
  if (s.length > 1950) {
    body = body.slice(0, Math.max(100, maxBody - (s.length - 1950)));
    s = JSON.stringify({ v: 1, kind: payload.kind, body, tr: 1 });
  }
  return s;
}

/**
 * @param {string} raw
 * @returns {{ kind: 'spec_intake' | 'customer_feedback', body: string, tr: number } | null}
 */
export function decodeDialogQueuePayload(raw) {
  try {
    const p = JSON.parse(String(raw || ''));
    if (p?.v !== 1 || !p.body) return null;
    if (p.kind !== 'spec_intake' && p.kind !== 'customer_feedback') return null;
    const body = String(p.body).slice(0, 2000);
    return { kind: p.kind, body, tr: p.tr ? 1 : 0 };
  } catch {
    return null;
  }
}

/**
 * @param {string} userText 원문 (정규화된 trimmed)
 * @returns {object[]}
 */
export function buildDialogQueueConfirmationBlocks(userText) {
  const specVal = encodeDialogQueuePayload({ kind: 'spec_intake', body: userText });
  const fbVal = encodeDialogQueuePayload({ kind: 'customer_feedback', body: userText });
  return [
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          '*워크스페이스 큐* — 이번에 보낸 말을 기록해 둘까요?\n' +
          '_실행 큐_는 툴/플랫폼 아이디어·구현 요청, _고객 피드백_은 고객 목소리용입니다. 해당 없으면 *안 올림*을 누르세요.',
      },
    },
    {
      type: 'actions',
      block_id: 'g1cos_dialog_queue_actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '실행 큐에 올리기', emoji: true },
          style: 'primary',
          action_id: 'g1cos_dialog_queue_spec',
          value: specVal,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '고객 피드백으로', emoji: true },
          action_id: 'g1cos_dialog_queue_feedback',
          value: fbVal,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '안 올림', emoji: true },
          action_id: 'g1cos_dialog_queue_skip',
          value: '{}',
        },
      ],
    },
  ];
}
