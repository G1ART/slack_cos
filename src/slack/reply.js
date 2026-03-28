export function stripMention(text) {
  return text.replace(/<@[^>]+>/g, '').trim();
}

export async function replyInThread(say, threadTs, message) {
  if (typeof message === 'string') {
    await say({ thread_ts: threadTs, text: message });
    return;
  }

  await say({
    thread_ts: threadTs,
    text: message?.text || '',
    blocks: message?.blocks,
  });
}
