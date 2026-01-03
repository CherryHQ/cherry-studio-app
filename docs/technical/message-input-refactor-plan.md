# MessageInput Full Restructure Plan

## Goal
Refactor MessageInput feature following Clean Architecture with service-based pub/sub pattern (like ModelSheet).

---

## Current Issues
1. **Duplicate ToolButton** - `components/ToolButton.tsx` duplicates root `ToolButton.tsx`
2. **Overloaded Root** - handles logic init, image upload, voice state, context creation
3. **Large useMessageInputLogic** - 184 lines mixing text, files, mentions, sending, editing
4. **Weak Type Safety** - ToolPreview uses `toolKey: keyof Assistant` (not safe)
5. **Context not memoized** - Root creates context object every render (line 87-107)
6. **Complex embedded logic** - MentionButton has model change logic inside

---

## New Directory Structure

```
MessageInput/
├── index.tsx                           # Compound component export
├── types/
│   ├── index.ts                        # Barrel export
│   ├── state.ts                        # MessageInputState, VoiceInputState
│   ├── actions.ts                      # MessageInputResult, MessageInputError
│   ├── config.ts                       # AssistantToolKey, ToolConfig
│   └── context.ts                      # MessageInputContextValue
├── services/
│   ├── index.ts                        # Barrel export
│   ├── MessageInputService.ts          # Pub/sub service (like SheetPresentationService)
│   ├── TextProcessingService.ts        # Long text conversion logic
│   ├── MentionValidationService.ts     # Model mention validation
│   └── ToolAvailabilityService.ts      # Type-safe tool enable/disable
├── hooks/
│   ├── index.ts                        # Barrel export
│   ├── useMessageInputService.ts       # Subscribe to service
│   ├── useTextInput.ts                 # Text state (extracted from lines 50-69)
│   ├── useFileAttachments.ts           # File state + paste handling
│   ├── useMentions.ts                  # Mention state (extracted from lines 71-98)
│   ├── useMessageSend.ts               # Send/edit logic (extracted from lines 100-168)
│   ├── useVoiceInput.ts                # Voice state
│   └── useInputHeight.ts               # TextField height (replace hidden input)
├── context/
│   └── MessageInputContext.tsx         # Updated with memoized value
├── components/
│   ├── index.ts
│   ├── Root.tsx                        # Simplified: compose hooks + provide context
│   ├── DefaultLayout.tsx
│   ├── Main.tsx
│   ├── InputArea.tsx
│   ├── InputRow.tsx
│   ├── TextField.tsx                   # Refactored: no hidden measurement input
│   ├── AccessoryBar.tsx
│   ├── Actions.tsx
│   └── Previews.tsx
├── buttons/
│   ├── index.ts
│   ├── ToolButton.tsx                  # Consolidated (remove duplicate)
│   ├── SendButton.tsx
│   ├── PauseButton.tsx
│   ├── VoiceButton.tsx
│   ├── ExpandButton.tsx
│   ├── ThinkButton.tsx
│   ├── MentionButton.tsx               # Refactored: use service for logic
│   └── McpButton.tsx
├── previews/
│   ├── index.ts
│   ├── EditingPreview.tsx
│   ├── ToolPreview.tsx                 # Refactored: type-safe tool keys
│   ├── FilePreview.tsx
│   └── items/
│       ├── index.tsx
│       ├── BaseItem.tsx
│       ├── FileItem.tsx
│       └── ImageItem.tsx
└── __tests__/                          # Unit tests for services/hooks
```

---

## Implementation Phases

### Phase 1: Types Foundation
Create `types/` folder with all interfaces:

| File | Key Types |
|------|-----------|
| `state.ts` | `MessageInputState`, `MessageInputDerivedState`, `VoiceInputState` |
| `actions.ts` | `MessageInputError`, `MessageInputResult<T>` (like ToolOperationResult) |
| `config.ts` | `AssistantToolKey = 'enableGenerateImage' \| 'enableWebSearch'`, `ToolConfig` |
| `context.ts` | `MessageInputContextValue` (refined from current) |

### Phase 2: Service Layer
Create services following SheetPresentationService pattern:

| Service | Responsibility |
|---------|----------------|
| `MessageInputService.ts` | Pub/sub for state, `subscribe()` returns unsubscribe fn |
| `TextProcessingService.ts` | `processInputText()` - long text detection & file conversion |
| `MentionValidationService.ts` | `validateMentions()`, `handleModelChange()` |
| `ToolAvailabilityService.ts` | `getEnabledTools()`, `toggleTool()`, `TOOL_CONFIGS` |

### Phase 3: Hook Decomposition
Split `useMessageInputLogic.ts` (184 lines) into focused hooks:

| Hook | Source Lines | Responsibility |
|------|--------------|----------------|
| `useTextInput.ts` | 50-69 | Text state + long text handling |
| `useFileAttachments.ts` | Root.tsx 48-85 | File state + paste images |
| `useMentions.ts` | 71-98 | Mentions + provider sync |
| `useMessageSend.ts` | 100-168 | Send/edit/pause operations |
| `useVoiceInput.ts` | Root.tsx 42 | Voice state wrapper |
| `useInputHeight.ts` | NEW | Replace hidden measurement input |

### Phase 4: Component Refactoring

**Root.tsx** - Simplify to composition only:
```typescript
const Root = ({ topic, assistant, updateAssistant }) => {
  // Compose hooks
  const { text, setText } = useTextInput({ onFileCreated: addFiles })
  const { files, setFiles, handlePasteImages } = useFileAttachments()
  const { mentions, setMentions } = useMentions({ topicId, assistant, updateAssistant })
  const { sendMessage, onPause, isEditing, cancelEditing } = useMessageSend({...})
  const { isVoiceActive, setIsVoiceActive } = useVoiceInput()

  // MEMOIZED context value (fixes issue)
  const contextValue = useMemo(() => ({...}), [deps])

  return <MessageInputContext.Provider value={contextValue}>...</MessageInputContext.Provider>
}
```

**TextField.tsx** - Remove hidden measurement input:
- Use `onContentSizeChange` from single TextInput
- Use `useInputHeight` hook for height calculation

**MentionButton.tsx** - Remove embedded logic:
- Pass `onMentionChange` callback instead of `setMentions`
- Use `handleModelChange()` from MentionValidationService

**ToolPreview.tsx** - Type-safe tool keys:
- Use `AssistantToolKey` type instead of `keyof Assistant`
- Use `TOOL_CONFIGS` from ToolAvailabilityService

### Phase 5: File Reorganization
Move files to new structure:

| From | To |
|------|-----|
| `ToolButton.tsx` (root) | `buttons/ToolButton.tsx` |
| `SendButton.tsx` | `buttons/SendButton.tsx` |
| `PauseButton.tsx` | `buttons/PauseButton.tsx` |
| `VoiceButton.tsx` | `buttons/VoiceButton.tsx` |
| `ExpandButton.tsx` | `buttons/ExpandButton.tsx` |
| `ThinkButton.tsx` | `buttons/ThinkButton.tsx` |
| `MentionButton.tsx` | `buttons/MentionButton.tsx` |
| `McpButton.tsx` | `buttons/McpButton.tsx` |
| `EditingPreview.tsx` | `previews/EditingPreview.tsx` |
| `ToolPreview.tsx` | `previews/ToolPreview.tsx` |
| `FilePreview.tsx` | `previews/FilePreview.tsx` |
| `PreviewItems/` | `previews/items/` |

### Phase 6: Cleanup
- Delete `components/ToolButton.tsx` (duplicate)
- Delete `hooks/useMessageInputLogic.ts` (replaced)
- Delete `MessageInputContainer.tsx` (minimal value)
- Update all imports in `index.tsx`

---

## Critical Files to Modify

| File | Changes |
|------|---------|
| `hooks/useMessageInputLogic.ts` | Decompose into 6 new hooks |
| `components/Root.tsx` | Compose hooks, memoize context |
| `components/TextField.tsx` | Remove hidden input, use useInputHeight |
| `MentionButton.tsx` | Remove logic, use callback |
| `ToolPreview.tsx` | Type-safe AssistantToolKey |
| `context/MessageInputContext.tsx` | Import types from types/ |
| `index.tsx` | Update exports |

---

## Key Patterns to Follow

### Result Type Pattern (from ToolSheet)
```typescript
type MessageInputResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: MessageInputError }
```

### Service Pub/Sub Pattern (from ModelSheet)
```typescript
interface IMessageInputService {
  subscribe(subscriber: MessageInputSubscriber): () => void  // Returns unsubscribe
  getState(): MessageInputState
  setState(partial: Partial<MessageInputState>): void
}
```

### Hook Composition Pattern
```typescript
// Main component acts as composition root
const Root = () => {
  const { data } = useFeatureData()
  const { state, actions } = useFeatureState({ initialData: data })
  const { handlers } = useFeatureHandlers({ state })
  // ...
}
```

---

## Files Summary

| Action | Count | Files |
|--------|-------|-------|
| CREATE | 22 | types/, services/, new hooks/, buttons/, previews/, __tests__/ |
| MODIFY | 7 | Root.tsx, TextField.tsx, MentionButton.tsx, ToolPreview.tsx, context/, index.tsx, AccessoryBar.tsx |
| DELETE | 3 | components/ToolButton.tsx, useMessageInputLogic.ts, MessageInputContainer.tsx |
| MOVE | 12 | All buttons and preview files |
