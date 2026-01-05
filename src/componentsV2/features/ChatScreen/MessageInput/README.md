# MessageInput

A compound component for chat message input with support for text, voice, file attachments, and AI tool integration.

## Usage

### Basic Usage

```tsx
import { MessageInput } from '@/componentsV2/features/ChatScreen/MessageInput'
;<MessageInput topic={topic} assistant={assistant} updateAssistant={updateAssistant} />
```

### Custom Layout

```tsx
<MessageInput topic={topic} assistant={assistant} updateAssistant={updateAssistant}>
  <MessageInput.Main>
    <MessageInput.ToolButton />
    <MessageInput.InputArea>
      <MessageInput.Previews />
      <MessageInput.InputRow>
        <MessageInput.TextField />
        <MessageInput.Actions />
      </MessageInput.InputRow>
    </MessageInput.InputArea>
  </MessageInput.Main>
  <MessageInput.AccessoryBar />
</MessageInput>
```

## Architecture

```
MessageInput/
├── index.tsx                    # Main entry, exports compound component
├── MessageInputContainer.tsx    # Container wrapper component
├── context/
│   └── MessageInputContext.tsx  # Shared state via React Context
├── components/
│   ├── Root.tsx                 # Context Provider wrapper
│   ├── Main.tsx                 # Main input row container
│   ├── ToolButton.tsx           # Add attachments button (+)
│   ├── InputArea.tsx            # Glass effect container
│   ├── Previews.tsx             # Preview content (editing, tools, files)
│   ├── InputRow.tsx             # TextField + Actions layout
│   ├── TextField.tsx            # Text input field
│   ├── Actions.tsx              # Send/Voice/Pause buttons
│   ├── AccessoryBar.tsx         # Bottom accessory buttons
│   └── DefaultLayout.tsx        # Default component composition
├── buttons/
│   ├── ExpandButton.tsx         # Expand input to full screen
│   ├── McpButton.tsx            # MCP tools toggle
│   ├── MentionButton.tsx        # Model mention selector
│   ├── PauseButton.tsx          # Pause streaming response
│   ├── SendButton.tsx           # Send message button
│   ├── ThinkButton.tsx          # Toggle reasoning mode
│   ├── ToolButton.tsx           # Add tools/attachments
│   └── VoiceButton.tsx          # Voice input toggle
├── previews/
│   ├── EditingPreview.tsx       # Editing mode indicator
│   ├── FilePreview.tsx          # Attached files preview
│   ├── ToolPreview.tsx          # Enabled tools preview
│   └── items/
│       ├── BaseItem.tsx         # Base preview item component
│       ├── FileItem.tsx         # File preview item
│       ├── ImageItem.tsx        # Image preview item
│       └── PreviewItem.tsx      # Generic preview item
├── hooks/
│   ├── useFileAttachments.ts    # File attachment state management
│   ├── useInputHeight.ts        # Dynamic input height calculation
│   ├── useMentions.ts           # Model mentions handling
│   ├── useMessageSend.ts        # Message send/edit operations
│   ├── useTextInput.ts          # Text input with long text handling
│   └── useVoiceInput.ts         # Voice input state
├── services/
│   ├── MentionValidationService.ts  # Validate model mentions
│   ├── MessageInputService.ts       # Core input operations
│   ├── TextProcessingService.ts     # Text processing utilities
│   └── ToolAvailabilityService.ts   # Tool availability checks
├── types/
│   ├── actions.ts               # Action type definitions
│   ├── config.ts                # Configuration constants
│   ├── context.ts               # Context type definitions
│   ├── state.ts                 # State type definitions
│   └── index.ts                 # Type exports
└── __tests__/
    ├── hooks/                   # Hook unit tests
    └── services/                # Service unit tests
```

## Components

| Component                   | Description                               |
| --------------------------- | ----------------------------------------- |
| `MessageInput`              | Root component, provides Context          |
| `MessageInput.Main`         | Main row with ToolButton + InputArea      |
| `MessageInput.ToolButton`   | Opens tool sheet for attachments          |
| `MessageInput.InputArea`    | Glass container with previews + input     |
| `MessageInput.Previews`     | Shows editing/tool/file previews          |
| `MessageInput.InputRow`     | Horizontal layout for TextField + Actions |
| `MessageInput.TextField`    | Multiline text input with expand support  |
| `MessageInput.Actions`      | Animated Send/Voice/Pause buttons         |
| `MessageInput.AccessoryBar` | Think, Mention, MCP buttons               |

## Buttons

| Button          | Description                        |
| --------------- | ---------------------------------- |
| `ExpandButton`  | Expands input to full screen sheet |
| `McpButton`     | Opens MCP server selection         |
| `MentionButton` | Opens model mention selector       |
| `PauseButton`   | Pauses streaming AI response       |
| `SendButton`    | Sends the current message          |
| `ThinkButton`   | Toggles reasoning/thinking mode    |
| `ToolButton`    | Opens attachment/tool selection    |
| `VoiceButton`   | Toggles voice input mode           |

## Context API

Access shared state in any child component:

```tsx
import { useMessageInput } from '@/componentsV2/features/ChatScreen/MessageInput'

const MyComponent = () => {
  const {
    // Props
    topic,
    assistant,
    updateAssistant,

    // State
    text,
    setText,
    files,
    setFiles,
    mentions,
    setMentions,

    // Derived
    isReasoning,
    isEditing,
    isLoading,

    // Actions
    sendMessage,
    onPause,
    cancelEditing,
    handleExpand,
    handlePasteImages,

    // Voice
    isVoiceActive,
    setIsVoiceActive,
  } = useMessageInput()

  return (/* ... */)
}
```

## Services

| Service                    | Description                                |
| -------------------------- | ------------------------------------------ |
| `MentionValidationService` | Validates model mentions against providers |
| `MessageInputService`      | Core message input operations              |
| `TextProcessingService`    | Long text handling, file conversion        |
| `ToolAvailabilityService`  | Checks tool availability for assistant     |

## Extending

### Adding a New Component

1. Create the component file:

```tsx
// components/NewFeature.tsx
import React from 'react'
import { useMessageInput } from '../context/MessageInputContext'

export const NewFeature: React.FC = () => {
  const { text, files, assistant } = useMessageInput()
  return (/* JSX */)
}
```

2. Register in `index.tsx`:

```tsx
import { NewFeature } from './components/NewFeature'

export const MessageInput = Object.assign(Root, {
  // ... existing components
  NewFeature
})
```

3. Use in layout:

```tsx
<MessageInput ...>
  <MessageInput.Main />
  <MessageInput.NewFeature />
  <MessageInput.AccessoryBar />
</MessageInput>
```

### Adding New Context Data

1. Extend interface in `context/MessageInputContext.tsx`:

```tsx
export interface MessageInputContextValue {
  // ... existing fields
  newField: string
  setNewField: (value: string) => void
}
```

2. Provide value in `components/Root.tsx`:

```tsx
const [newField, setNewField] = useState('')

const contextValue: MessageInputContextValue = {
  // ... existing values
  newField,
  setNewField
}
```

## Features

- **Text Input**: Multiline with auto-expand and paste image support
- **Voice Input**: Speech-to-text transcription
- **File Attachments**: Images, documents via ToolButton
- **Tool Integration**: MCP tools, mentions, reasoning toggle
- **Edit Mode**: Edit and regenerate previous messages
- **Animations**: Smooth transitions between Send/Voice/Pause buttons
- **Glass Effect**: iOS 26+ liquid glass styling support

## Testing

Tests are located in `__tests__/` directory:

- `hooks/` - Unit tests for all custom hooks
- `services/` - Unit tests for all services

Run tests with:

```bash
yarn test src/componentsV2/features/ChatScreen/MessageInput
```
