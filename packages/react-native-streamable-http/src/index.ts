import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import type { Transport, TransportSendOptions } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'
import { isInitializedNotification, JSONRPCMessageSchema } from '@modelcontextprotocol/sdk/types.js'

// React Native compatible EventSource parser
class RNEventSourceParser {
  private buffer = ''

  parse(chunk: string): { event?: string; data: string; id?: string }[] {
    this.buffer += chunk
    const events: { event?: string; data: string; id?: string }[] = []
    const lines = this.buffer.split('\n')

    // Keep the last incomplete line in buffer
    this.buffer = lines.pop() || ''

    let currentEvent: { event?: string; data: string; id?: string } = {
      data: ''
    }

    for (const line of lines) {
      if (line === '') {
        // Empty line indicates end of event
        if (currentEvent.data) {
          events.push(currentEvent)
          currentEvent = { data: '' }
        }
        continue
      }

      const colonIndex = line.indexOf(':')
      if (colonIndex === -1) continue

      const field = line.slice(0, colonIndex)
      const value = line.slice(colonIndex + 1).replace(/^ /, '') // Remove leading space

      switch (field) {
        case 'event':
          currentEvent.event = value
          break
        case 'data':
          currentEvent.data += (currentEvent.data ? '\n' : '') + value
          break
        case 'id':
          currentEvent.id = value
          break
      }
    }

    return events
  }
}

export interface RNStreamableHTTPClientTransportOptions {
  fetch?: typeof fetch
  requestInit?: RequestInit
  sessionId?: string
  /**
   * OAuth client provider for handling authentication.
   * When provided, the transport will:
   * 1. Inject Bearer token from provider.tokens() into Authorization header
   */
  authProvider?: OAuthClientProvider
}

export class RNStreamableHTTPClientTransport implements Transport {
  private _url: string
  private _fetch: typeof fetch
  private _requestInit?: RequestInit
  private _sessionId?: string
  private _abortController?: AbortController
  private _protocolVersion?: string
  private _authProvider?: OAuthClientProvider

  public onclose?: () => void
  public onerror?: (error: Error) => void
  public onmessage?: (message: JSONRPCMessage) => void

  constructor(url: string, options?: RNStreamableHTTPClientTransportOptions) {
    this._url = url
    this._fetch = options?.fetch || fetch // Use Expo's streaming-capable fetch by default
    this._requestInit = options?.requestInit
    this._sessionId = options?.sessionId
    this._authProvider = options?.authProvider
  }

  /**
   * Handle errors with fallback logging when no error handler is set.
   * This ensures errors are never silently swallowed.
   */
  private _handleError(error: Error, context?: string): void {
    if (this.onerror) {
      this.onerror(error)
    } else {
      console.error(`[RNStreamableHTTP${context ? `:${context}` : ''}] Unhandled transport error:`, error)
    }
  }

  private async _commonHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {}

    // Inject Bearer token from authProvider if available
    if (this._authProvider) {
      const tokens = await this._authProvider.tokens()
      if (tokens?.access_token) {
        headers['Authorization'] = `Bearer ${tokens.access_token}`
      }
    }

    if (this._sessionId) {
      headers['mcp-session-id'] = this._sessionId
    }

    if (this._protocolVersion) {
      headers['mcp-protocol-version'] = this._protocolVersion
    }

    // Add any extra headers from requestInit
    if (this._requestInit?.headers) {
      const extraHeaders = this._requestInit.headers
      if (extraHeaders instanceof Headers) {
        extraHeaders.forEach((value, key) => {
          headers[key] = value
        })
      } else if (Array.isArray(extraHeaders)) {
        extraHeaders.forEach(([key, value]) => {
          headers[key] = value
        })
      } else {
        Object.assign(headers, extraHeaders)
      }
    }

    return headers
  }

  private async _handleSseResponse(response: Response): Promise<void> {
    if (!response.body) {
      return
    }

    const parser = new RNEventSourceParser()
    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const events = parser.parse(chunk)

        for (const event of events) {
          if (!event.event || event.event === 'message') {
            try {
              const message = JSONRPCMessageSchema.parse(JSON.parse(event.data))
              this.onmessage?.(message)
            } catch (error) {
              this._handleError(error as Error, 'SSE message parse')
            }
          }
        }
      }
    } catch (error) {
      this._handleError(error as Error, 'SSE stream read')
    } finally {
      reader.releaseLock()
    }
  }

  async start(): Promise<void> {
    if (this._abortController) {
      throw new Error('StreamableHTTPClientTransport already started!')
    }
    this._abortController = new AbortController()
  }

  private async _sendWithXHR(message: JSONRPCMessage, headers: Record<string, string>): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const parser = new RNEventSourceParser()

      xhr.open('POST', this._url, true)

      // Set headers
      Object.entries(headers).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value)
      })

      let responseText = ''
      let hasReceivedData = false

      xhr.onreadystatechange = () => {
        if (xhr.readyState === XMLHttpRequest.LOADING || xhr.readyState === XMLHttpRequest.DONE) {
          // Get incremental response text
          const newText = xhr.responseText.substring(responseText.length)
          responseText = xhr.responseText

          if (newText) {
            const events = parser.parse(newText)
            for (const event of events) {
              if (!event.event || event.event === 'message') {
                if (!event.data) continue
                try {
                  const parsedMessage = JSONRPCMessageSchema.parse(JSON.parse(event.data))
                  this.onmessage?.(parsedMessage)
                  hasReceivedData = true
                } catch (error) {
                  this._handleError(error as Error, 'XHR SSE parse')
                }
              }
            }
          }
        }

        if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
          // Extract session ID as soon as headers are received
          const sessionId = xhr.getResponseHeader('mcp-session-id')
          if (sessionId) {
            this._sessionId = sessionId
          }
        }

        if (xhr.readyState === XMLHttpRequest.DONE) {
          if (xhr.status >= 200 && xhr.status < 300) {
            if (!hasReceivedData && responseText.trim()) {
              const contentType = xhr.getResponseHeader('content-type') || ''
              if (contentType.includes('application/json')) {
                try {
                  const data = JSON.parse(responseText)
                  const responseMessages = Array.isArray(data)
                    ? data.map(item => JSONRPCMessageSchema.parse(item))
                    : [JSONRPCMessageSchema.parse(data)]
                  responseMessages.forEach(responseMessage => this.onmessage?.(responseMessage))
                  hasReceivedData = responseMessages.length > 0
                } catch (error) {
                  this._handleError(error as Error, 'XHR JSON response parse')
                }
              } else {
                const lines = responseText.split('\n')
                const dataLine = lines.find(line => line.startsWith('data:'))
                if (dataLine) {
                  try {
                    const jsonData = dataLine.substring(5).trim()
                    const parsedMessage = JSONRPCMessageSchema.parse(JSON.parse(jsonData))
                    this.onmessage?.(parsedMessage)
                    hasReceivedData = true
                  } catch (error) {
                    this._handleError(error as Error, 'XHR SSE data parse')
                  }
                }
              }
            }
            if (xhr.status === 202 && isInitializedNotification(message)) {
              this._startSseStream().catch(err => this._handleError(err, 'SSE stream start'))
            }
            resolve()
          } else if (xhr.status === 401) {
            // Special handling for 401 - throw with identifiable error
            const error = new Error(`HTTP 401: Unauthorized`)
            ;(error as Error & { status: number }).status = 401
            reject(error)
          } else {
            reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText}`))
          }
        }
      }

      xhr.onerror = () => reject(new Error('Network error'))
      xhr.ontimeout = () => reject(new Error('Request timeout'))

      xhr.send(JSON.stringify(message))
    })
  }

  async send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
    void options
    try {
      const headers = await this._commonHeaders()
      headers['content-type'] = 'application/json'
      headers['accept'] = 'application/json, text/event-stream'

      // Try XMLHttpRequest for potentially faster SSE handling
      try {
        await this._sendWithXHR(message, headers)
        return
      } catch (xhrError) {
        // Check if XHR failed with 401 and we have an authProvider
        if (
          this._authProvider &&
          xhrError instanceof Error &&
          ((xhrError as Error & { status?: number }).status === 401 || xhrError.message.includes('401'))
        ) {
          throw xhrError
        }
        // XHR failed, falling back to fetch
        console.debug('[RNStreamableHTTP] XHR request failed, falling back to fetch:', xhrError)
      }

      // Fallback to original fetch approach
      const init: RequestInit = {
        ...this._requestInit,
        method: 'POST',
        headers,
        body: JSON.stringify(message),
        signal: this._abortController?.signal
      }

      const response = await this._fetch(this._url, init)

      // Handle session ID received during initialization
      const sessionId = response.headers.get('mcp-session-id')
      if (sessionId) {
        this._sessionId = sessionId
      }

      // Handle 401 Unauthorized with OAuth flow
      if (response.status === 401 && this._authProvider) {
        const error = new Error('HTTP 401: Unauthorized')
        ;(error as Error & { status?: number }).status = 401
        throw error
      }

      if (!response.ok) {
        const text = await response.text().catch(() => null)
        throw new Error(`Error POSTing to endpoint (HTTP ${response.status}): ${text}`)
      }

      // If the response is 202 Accepted, there's no body to process
      if (response.status === 202) {
        // If the accepted notification is initialized, we start the SSE stream
        // if it's supported by the server
        if (isInitializedNotification(message)) {
          // Start SSE stream for receiving server messages
          this._startSseStream().catch(err => this._handleError(err, 'SSE stream start'))
        }
        return
      }

      // Check the response type
      const contentType = response.headers.get('content-type')

      const hasRequests = 'method' in message && 'id' in message && message.id !== undefined

      if (hasRequests || response.status === 200) {
        if (contentType?.includes('text/event-stream')) {
          this._handleSseResponse(response).catch(err => this._handleError(err, 'SSE response'))
          return
        }

        const text = await response.text()

        if (contentType?.includes('application/json')) {
          // Parse as direct JSON
          try {
            const data = JSON.parse(text)
            const responseMessages = Array.isArray(data)
              ? data.map(item => JSONRPCMessageSchema.parse(item))
              : [JSONRPCMessageSchema.parse(data)]
            responseMessages.forEach(responseMessage => this.onmessage?.(responseMessage))
          } catch (error) {
            this._handleError(error as Error, 'JSON response parse')
          }
        } else {
          // Parse as SSE data (works for both SSE and plain text responses)
          if (text.trim()) {
            const lines = text.split('\n')
            const dataLine = lines.find(line => line.startsWith('data:'))
            if (dataLine) {
              try {
                const jsonData = dataLine.substring(5).trim() // Remove 'data:' prefix
                const parsedMessage = JSONRPCMessageSchema.parse(JSON.parse(jsonData))
                this.onmessage?.(parsedMessage)
              } catch (error) {
                this._handleError(error as Error, 'SSE data parse')
              }
            }
          }
        }
      }
    } catch (error) {
      this._handleError(error as Error, 'send')
      throw error
    }
  }

  private async _startSseStream(): Promise<void> {
    try {
      const headers = await this._commonHeaders()
      headers['Accept'] = 'text/event-stream'

      const response = await this._fetch(this._url, {
        method: 'GET',
        headers,
        signal: this._abortController?.signal
      })

      if (!response.ok) {
        // 405 indicates that the server does not offer an SSE stream at GET endpoint
        // This is an expected case that should not trigger an error
        if (response.status === 405) {
          return
        }
        throw new Error(`Failed to open SSE stream: ${response.statusText}`)
      }

      await this._handleSseResponse(response)
    } catch (error) {
      this._handleError(error as Error, 'SSE stream')
    }
  }

  async close(): Promise<void> {
    this._abortController?.abort()
    this.onclose?.()
  }

  get sessionId(): string | undefined {
    return this._sessionId
  }

  setProtocolVersion(version: string): void {
    this._protocolVersion = version
  }

  get protocolVersion(): string | undefined {
    return this._protocolVersion
  }
}
