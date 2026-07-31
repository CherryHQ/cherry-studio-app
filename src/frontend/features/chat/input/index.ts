// Public component surface of the chat input area. Other features (today:
// paintings) compose the chat input through this module; deep imports of the
// component/context modules below violate the module ownership boundary.
//
// Three pure-logic modules are additionally sanctioned for direct import so
// logic-only consumers (and their node-env tests) don't have to load this
// component barrel: ./chatInputLayout, ./utils/chatInputAttachments, and
// ./hooks/useChatInputPhotoPicker. The ESLint boundary rules allowlist them.
export { ChatInput } from './ChatInput';
export { ChatInputActionSheet } from './components/ChatInputActionSheet';
export {
  type ChatInputModelSettings,
  type ChatInputSendPayload,
  ChatInputSurface,
} from './components/ChatInputSurface';
export {
  ChatInputProvider,
  useChatInputActions,
  useChatInputState,
} from './context/ChatInputProvider';
