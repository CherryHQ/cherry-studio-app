const USER_MESSAGE_ANCHOR_TEXT_LINES = 2;

export const USER_MESSAGE_BUBBLE_PADDING = 8;

/**
 * The user-message content height that may participate in the latest-message anchor.
 * The list adds its own row padding separately, so this contract stays owned by the
 * user-message presentation instead of duplicating its bubble geometry in the list.
 */
export function resolveUserMessageContentAnchorMaxSize(bodyLineHeight: number) {
  return USER_MESSAGE_ANCHOR_TEXT_LINES * bodyLineHeight + USER_MESSAGE_BUBBLE_PADDING * 2;
}
