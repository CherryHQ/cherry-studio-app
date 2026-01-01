# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a React Native polyfill library for Model Context Protocol (MCP) StreamableHTTP transport. It provides a React Native-compatible implementation of streaming HTTP connections for MCP clients.

## Build Commands

- `npm run build` - Compile TypeScript to JavaScript in the `dist/` directory
- `npm run prepublishOnly` - Build the project before publishing (automatically runs build)

## Architecture

The library consists of a single main class `RNStreamableHTTPClientTransport` located in `src/index.ts` that implements the MCP Transport interface. Key architectural components:

### RNEventSourceParser

A custom EventSource parser designed specifically for React Native environments, handling server-sent events parsing without relying on browser-specific EventSource APIs.

### Transport Implementation

- **Primary method**: XMLHttpRequest with fallback to fetch API
- **Streaming**: Handles both SSE (Server-Sent Events) and JSON responses
- **Session management**: Automatic MCP session ID handling via headers
- **Error handling**: Comprehensive error recovery with multiple transport strategies

### Key Features

- React Native compatible streaming HTTP
- Dual transport strategy (XHR + fetch fallback)
- Custom SSE parsing for React Native
- MCP protocol version and session management
- AbortController support for request cancellation

## Dependencies

- `@modelcontextprotocol/sdk` - Core MCP SDK for types and utilities
- Uses TypeScript with strict mode and ES modules
- Targets ESNext with NodeNext module resolution

## TypeScript Configuration

- Strict TypeScript with `verbatimModuleSyntax`
- Outputs to `dist/` with declaration files and source maps
- Configured for ES modules (`type: "module"` in package.json)
