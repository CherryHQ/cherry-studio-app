export type EditReplyTarget = { sessionId: string; messageId: string };

export function editReplyHref(target: EditReplyTarget) {
  return { pathname: '/edit-reply' as const, params: target };
}
