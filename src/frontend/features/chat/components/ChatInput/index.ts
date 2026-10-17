// Agent chat's narrow wrapper around the shared composer. Callers outside chat
// want the composer primitives rather than this protocol-bound surface.
export { ChatInput } from './ChatInput';
export { ChatInputAccessories, ChatInputSurface } from './ChatInputSurface';
export {
  ChatReplyTargetProvider,
  useChatReplyTarget,
  useChatReplyTargetState,
  type ChatReplyTarget,
} from './ChatReplyTarget';
