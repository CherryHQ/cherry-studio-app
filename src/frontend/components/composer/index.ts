// The app's input surface, shared by chat and painting. Assembled by the
// caller: `ComposerSurface` is the root and owns the send protocol, everything
// else is a part to arrange inside it, alongside the presentational
// `Composer.*` parts from `@cherrystudio/ui`.
//
// `utils/composerAttachments` is deliberately left deep-importable so logic-only
// consumers and its node-env tests do not have to load this barrel and,
// through it, the native modules the pickers and the field pull in.
export { ComposerAttachments } from './components/ComposerAttachments';
export { ComposerDock } from './components/ComposerDock';
export { ComposerField } from './components/ComposerField';
export { ComposerMenu } from './components/ComposerMenu';
export { ComposerModelPill } from './components/ComposerModelPill';
export { ComposerSessionProvider } from './components/ComposerSessionProvider';
export { ComposerSurface, type ComposerSendPayload } from './components/ComposerSurface';
export {
  type ComposerAttachmentStore,
  useComposerActions,
  useComposerMeta,
  useComposerPresentationActions,
  useComposerState,
} from './context/ComposerProvider';
