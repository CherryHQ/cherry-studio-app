/**
 * Shape-only port of desktop src/shared/utils/shortcut.ts (registered in
 * desktop-sync-manifest.json `shapeOnlyPorts`). The token vocabulary and
 * binding types back ~30 seeded `shortcut.*` preference values so desktop
 * backups round-trip. Desktop-only capability halves — accelerator/hotkey
 * conversion, key display formatting, binding validation for the desktop
 * command system — are dropped: mobile has no keyboard shortcut surface.
 */
export const SHORTCUT_MODIFIERS = [
  'CommandOrControl',
  'Command',
  'Ctrl',
  'Alt',
  'AltGr',
  'Shift',
  'Meta',
] as const;

export const SHORTCUT_LETTERS = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
] as const;

export const SHORTCUT_DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export const SHORTCUT_FUNCTION_KEYS = [
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
] as const;

export const SHORTCUT_SYMBOLS = ['=', '-', '[', ']', ',', '.', '/', '\\', ';', "'", '`'] as const;

export const SHORTCUT_NAMED_KEYS = [
  'Escape',
  'Enter',
  'Tab',
  'Space',
  'Backspace',
  'Delete',
  'Insert',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Up',
  'Down',
  'Left',
  'Right',
  'numadd',
  'numsub',
] as const;

export type ShortcutModifier = (typeof SHORTCUT_MODIFIERS)[number];
export type ShortcutLetter = (typeof SHORTCUT_LETTERS)[number];
export type ShortcutDigit = (typeof SHORTCUT_DIGITS)[number];
export type ShortcutFunctionKey = (typeof SHORTCUT_FUNCTION_KEYS)[number];
export type ShortcutSymbol = (typeof SHORTCUT_SYMBOLS)[number];
export type ShortcutNamedKey = (typeof SHORTCUT_NAMED_KEYS)[number];

export type ShortcutToken =
  | ShortcutModifier
  | ShortcutLetter
  | ShortcutDigit
  | ShortcutFunctionKey
  | ShortcutSymbol
  | ShortcutNamedKey;

export type ShortcutBinding = readonly ShortcutToken[];

const shortcutTokens = [
  ...SHORTCUT_MODIFIERS,
  ...SHORTCUT_LETTERS,
  ...SHORTCUT_DIGITS,
  ...SHORTCUT_FUNCTION_KEYS,
  ...SHORTCUT_SYMBOLS,
  ...SHORTCUT_NAMED_KEYS,
] as const;

const shortcutTokenSet = new Set<string>(shortcutTokens);

export const isShortcutToken = (value: unknown): value is ShortcutToken =>
  typeof value === 'string' && shortcutTokenSet.has(value);
