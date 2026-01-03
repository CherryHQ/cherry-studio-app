import { ToolButton } from './buttons'
import { AccessoryBar } from './components/AccessoryBar'
import { Actions } from './components/Actions'
import { InputArea } from './components/InputArea'
import { InputRow } from './components/InputRow'
import { Main } from './components/Main'
import { Previews } from './components/Previews'
import { Root } from './components/Root'
import { MessageTextField } from './components/TextField'

export const MessageInput = Object.assign(Root, {
  Main,
  ToolButton,
  InputArea,
  Previews,
  InputRow,
  TextField: MessageTextField,
  Actions,
  AccessoryBar
})

// Re-export context hook for external use
export { useMessageInput } from './context/MessageInputContext'
