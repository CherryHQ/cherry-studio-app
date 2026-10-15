export { Composer } from './components/composer';
export type { ComposerDockProps } from './components/composer-dock';
export { useComposerExpansion } from './components/composer-expansion';
export { useComposerMenu } from './components/morph-menu';
export type {
  MorphMenuItemProps,
  MorphMenuProps,
  MorphMenuToggleProps,
} from './components/morph-menu';
export type {
  ComposerActionProps,
  ComposerCollapsibleProps,
  ComposerInputHandle,
  ComposerInputProps,
  ComposerLabels,
  ComposerPillProps,
  ComposerProps,
  ComposerSendProps,
  ComposerToolbarProps,
} from './composer.types';
export { useComposerDockLayout } from './hooks/use-composer-dock-layout';
export { COMPOSER_MAX_TEXT_HEIGHT } from './utils/composer-layout';
export {
  composerContentGap,
  getComposerActionCenterOffset,
  getComposerKeyboardStickyOffset,
} from './utils/composer-dock-layout';
