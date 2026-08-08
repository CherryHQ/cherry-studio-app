// The app's input surface, shared by chat and painting. Two pure-logic modules
// are deliberately left deep-importable — `utils/composerAttachments` and
// `utils/composerLayout` — so logic-only consumers and their node-env tests do
// not have to load this barrel and, through it, the native modules the pickers
// and the field pull in.
export {
  ComposerCore,
  type ComposerModelSettings,
  type ComposerSendPayload,
} from './components/ComposerCore';
export { ComposerDock } from './components/ComposerDock';
export { ComposerProvider, useComposerActions, useComposerState } from './context/ComposerProvider';
export { useComposerDockLayout } from './hooks/useComposerDockLayout';
