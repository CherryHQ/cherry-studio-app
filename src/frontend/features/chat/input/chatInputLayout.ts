// What the message list reserves for the input before it has measured one: a
// single-line field plus the toolbar row under it, at the composer's own sizes.
const chatInputTextRowHeight = 44;
const chatInputToolbarRowHeight = 44;
export const chatInputMinComposerHeight = chatInputTextRowHeight + chatInputToolbarRowHeight;
export const chatInputMinBottomPadding = 8;
export const chatInputHorizontalScreenInset = 16;
export const chatInputMessageListGap = 8;

export function getChatInputMinimumHeight(bottomInset: number) {
  return chatInputMinComposerHeight + Math.max(bottomInset, chatInputMinBottomPadding);
}

// KeyboardStickyView offset shared by the floating input and anything that
// must ride along with it (e.g. the reasoning panel): with the keyboard open
// the safe-area bottom padding is no longer needed, keep only the minimum.
export function getChatInputKeyboardStickyOffset(bottomInset: number) {
  return Math.max(bottomInset - chatInputMinBottomPadding, 0);
}

// The composer's own horizontal padding, mirrored from `composer.layout.ts`.
// The ＋ button starts here, and so does the menu that grows out of it.
const composerSurfacePadding = 12;
// The composer's bottom padding, likewise. Below the ＋ button's own row there
// is only this and the screen inset.
const composerSurfaceBottomPadding = 8;
// Air left between the menu and the edges it grows towards.
const menuScreenMargin = 12;
// The menu panel's own padding, mirrored from `morph-menu.tsx`. The room below
// is for what goes *inside* the panel, so the panel's own inset comes off it.
const menuPanelPadding = 8;

/**
 * How much room the ＋ menu has to grow into. It grows up and to the right out
 * of a button whose position is fixed by the composer's padding rather than by
 * its content — the toolbar is the composer's last row — so this is arithmetic
 * on the insets rather than a measurement.
 *
 * Only valid with the keyboard down, which is why opening the menu dismisses it.
 */
export function getChatInputMenuRoom(
  window: { height: number; width: number },
  insets: { bottom: number; top: number },
) {
  const menuLeft = chatInputHorizontalScreenInset + composerSurfacePadding;
  const menuBottom =
    Math.max(insets.bottom, chatInputMinBottomPadding) + composerSurfaceBottomPadding;

  return {
    maxHeight: window.height - insets.top - menuBottom - menuScreenMargin - menuPanelPadding * 2,
    maxWidth: window.width - menuLeft - menuScreenMargin - menuPanelPadding * 2,
  };
}

// Roughly twice the menu's first level on each axis. Sized rather than measured:
// it is a design choice about how big a viewfinder should feel, not a
// consequence of how many rows the level above happens to have.
const cameraPanelWidth = 400;
const cameraPanelHeight = 520;

/**
 * The camera level's size. It stays inside the ＋ panel rather than going full
 * screen — big enough to frame a shot, still recognisably the same panel.
 *
 * A maximum, not a size: on a phone the width runs out first and the room wins.
 */
export function getChatInputCameraPanelSize(room: { maxHeight: number; maxWidth: number }) {
  return {
    height: Math.min(cameraPanelHeight, room.maxHeight),
    width: Math.min(cameraPanelWidth, room.maxWidth),
  };
}
