# Polyfill for React Native StreamableHTTPClientTransport

A React Native-compatible polyfill for Model Context Protocol (MCP) StreamableHTTP transport. This package provides a drop-in replacement for the standard `@modelcontextprotocol/sdk` StreamableHTTPClientTransport that works reliably in React Native environments.

## Why This Package?

The standard MCP SDK's `StreamableHTTPClientTransport` relies on browser-specific APIs that don't work properly in React Native environments. This package provides:

- **React Native compatibility** - Works with Expo and bare React Native projects
- **Streaming support** - Handles Server-Sent Events (SSE) and real-time responses
- **Dual transport strategy** - XMLHttpRequest with fetch fallback for maximum compatibility
- **Drop-in replacement** - Same API as the standard MCP transport
- **Session management** - Automatic MCP session handling

## Installation

```bash
npm install @cherrystudio/react-native-streamable-http
```

## Quick Start

Replace your existing MCP transport import:

```typescript
// Before (doesn't work in React Native)
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/transports/http.js'

// After (React Native compatible)
import { RNStreamableHTTPClientTransport } from '@cherrystudio/react-native-streamable-http'
```

## Usage

### Basic Usage

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { RNStreamableHTTPClientTransport } from '@cherrystudio/react-native-streamable-http'

// Create the transport
const transport = new RNStreamableHTTPClientTransport(url)

// Create MCP client
const client = new Client(
  {
    name: 'my-react-native-app',
    version: '1.0.0'
  },
  {
    capabilities: {}
  }
)

// Connect the client
await client.connect(transport)

// Now you can use the MCP client normally
const tools = await client.listTools()
console.log('Available tools:', tools)
```

### Advanced Configuration

```typescript
import { RNStreamableHTTPClientTransport } from '@cherrystudio/react-native-streamable-http'

const transport = new RNStreamableHTTPClientTransport(url, {
  // Use custom fetch implementation (optional)
  fetch: customFetch,

  // Add custom headers or request options
  requestInit: {
    headers: {
      Authorization: 'Bearer your-token',
      'Custom-Header': 'value'
    },
    timeout: 30000
  },

  // Set initial session ID (optional)
  sessionId: 'existing-session-id'
})
```

### Complete Example with Error Handling

```typescript
import React, { useEffect, useState } from 'react';
import { View, Text, Button } from 'react-native';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { RNStreamableHTTPClientTransport } from "@cherrystudio/react-native-streamable-http";

export default function MCPExample() {
  const [client, setClient] = useState<Client | null>(null);
  const [tools, setTools] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const connectToMCP = async () => {
    try {
      const transport = new RNStreamableHTTPClientTransport(
        url
      );

      const mcpClient = new Client(
        {
          name: "react-native-mcp-client",
          version: "1.0.0",
        },
        {
          capabilities: {},
        }
      );

      // Set up error handling
      transport.onerror = (error) => {
        console.error("Transport error:", error);
        setError(error.message);
      };

      transport.onclose = () => {
        console.log("Transport closed");
        setClient(null);
      };

      await mcpClient.connect(transport);
      setClient(mcpClient);
      setError(null);

      // List available tools
      const availableTools = await mcpClient.listTools();
      setTools(availableTools.tools || []);

    } catch (err) {
      console.error("Failed to connect:", err);
      setError(err instanceof Error ? err.message : "Connection failed");
    }
  };

  const disconnect = async () => {
    if (client) {
      await client.close();
      setClient(null);
      setTools([]);
    }
  };

  return (
    <View style={{ padding: 20 }}>
      <Text>MCP Client Status: {client ? "Connected" : "Disconnected"}</Text>

      {error && <Text style={{ color: 'red' }}>Error: {error}</Text>}

      <Button
        title={client ? "Disconnect" : "Connect"}
        onPress={client ? disconnect : connectToMCP}
      />

      {tools.length > 0 && (
        <View>
          <Text>Available Tools:</Text>
          {tools.map((tool, index) => (
            <Text key={index}>- {tool.name}</Text>
          ))}
        </View>
      )}
    </View>
  );
}
```

### Using with Expo

This package works seamlessly with Expo projects. No additional configuration required:

```typescript
// In your Expo React Native app
import { RNStreamableHTTPClientTransport } from '@cherrystudio/react-native-streamable-http'

// Use exactly as shown in the examples above
const transport = new RNStreamableHTTPClientTransport('http://your-server/mcp')
```

## API Reference

### `RNStreamableHTTPClientTransport`

#### Constructor

```typescript
new RNStreamableHTTPClientTransport(url: string, options?: RNStreamableHTTPClientTransportOptions)
```

**Parameters:**

- `url` - The MCP server endpoint URL
- `options` - Optional configuration object

#### Options

```typescript
interface RNStreamableHTTPClientTransportOptions {
  fetch?: typeof fetch // Custom fetch implementation
  requestInit?: RequestInit // Additional request options
  sessionId?: string // Initial session ID
  authProvider?: OAuthClientProvider // OAuth provider for auth flows
}
```

#### Properties

- `sessionId: string | undefined` - Current MCP session ID
- `protocolVersion: string | undefined` - MCP protocol version

#### Methods

- `start(): Promise<void>` - Initialize the transport
- `send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void>` - Send a message
- `close(): Promise<void>` - Close the transport connection
- `setProtocolVersion(version: string): void` - Set the MCP protocol version

#### Event Handlers

- `onmessage?: (message: JSONRPCMessage) => void` - Handle incoming messages
- `onerror?: (error: Error) => void` - Handle transport errors
- `onclose?: () => void` - Handle transport closure

## Troubleshooting

### Common Issues

**CORS issues**

- Ensure your MCP server has proper CORS headers configured
- For development, you may need to configure your server to allow your React Native app's origin

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Related

- [Model Context Protocol](https://modelcontextprotocol.io/) - Official MCP documentation
- [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) - Official MCP SDK
