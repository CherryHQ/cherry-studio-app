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
└── hooks/
    └── useMessageInputLogic.ts  # Core business logic
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
