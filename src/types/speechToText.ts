export type SpeechToTextProvider = {
  id: string
  name: string
  type: 'builtin' | 'api'
  apiKey?: string
  apiHost?: string
}
