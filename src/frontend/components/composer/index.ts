// The app's input surface, shared by chat and painting. Assembled by the
// caller: `ComposerSurface` is the root and owns the send protocol, everything
// else is a part to arrange inside it, alongside the presentational
// `Composer.*` parts from `@cherrystudio/ui`.
//
// Two pure-logic modules are deliberately left deep-importable —
// `utils/composerAttachments` and `utils/composerLayout` — so logic-only
// consumers and their node-env tests do not have to load this barrel and,
// through it, the native modules the pickers and the field pull in.
export { ComposerAttachments } from './components/ComposerAttachments';
export { ComposerDock } from './components/ComposerDock';
export { ComposerField } from './components/ComposerField';
export { ComposerMenu } from './components/ComposerMenu';
export { ComposerModelPill } from './components/ComposerModelPill';
export { ComposerSurface, type ComposerSendPayload } from './components/ComposerSurface';
export { ManagedComposerProvider } from './components/ManagedComposerProvider';
export {
  type ComposerAttachmentStore,
  ComposerProvider,
  useComposerActions,
  useComposerState,
} from './context/ComposerProvider';
export { useComposerDockLayout } from './hooks/useComposerDockLayout';
export { useComposerFieldDismiss } from './hooks/useComposerFieldDismiss';
