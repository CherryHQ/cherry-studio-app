# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development

- `yarn start` - Start Expo development server
- `yarn android` - Run on Android device/emulator
- `yarn ios` - Run on iOS device/simulator
- `yarn prebuild` - Generate native code (required before first native run)

### Database

- `npx drizzle-kit generate` - Generate database migrations (required before first app run)
- `npx drizzle-kit studio` - Open Drizzle Studio for database inspection

### Code Quality

- `yarn lint` - Run ESLint with auto-fix
- `yarn format` - Run Prettier and ESLint formatting
- `yarn test` - Run Jest tests with watch mode
- `yarn check:i18n` - Validate internationalization files for missing translations
- `yarn sync:i18n` - Sync translation keys across all language files

## Architecture Overview

Cherry Studio is a React Native/Expo AI chat application with clean architecture principles:

### Data Layer

- **SQLite + Drizzle ORM**: Type-safe database operations with schema-first approach
- **Redux Toolkit**: State management with persistence via AsyncStorage
- **MMKV**: High-performance key-value storage for sensitive data

### AI Core Layer (`src/aiCore/`)

Provider abstraction supporting multiple LLM services (OpenAI, Anthropic, Google, etc.):

- `Provider` classes handle authentication and request formatting
- `ModelManager` manages model configurations and capabilities
- `StreamingService` handles Server-Sent Events for real-time responses
- Middleware pattern for request/response processing

### Service Layer (`src/services/`)

Business logic separated from UI components:

- `BackupService` - Data import/export functionality
- `LoggerService` - Application logging with context
- `FileService` - File upload/management operations
- `TopicService` - Chat conversation management

### State Management

Redux slices with specific purposes:

- `app` - Application initialization and onboarding state
- `assistant` - Assistant configurations and marketplace
- `topic` - Chat conversations and active topic
- `settings` - User preferences and app configuration
- `runtime` - Temporary state (not persisted)

### Database Schema

Key entities managed via Drizzle ORM:

- `assistants` - AI assistant configurations
- `topics` - Chat conversation threads
- `messages` - Individual chat messages with metadata
- `providers` - LLM service configurations
- `files` - Uploaded attachments and documents

## Key Patterns

### Component Architecture

- UI components in `src/components/` with clear separation (ui/, sheets/, message-input/)
- Screen components in `src/screens/` organized by feature area
- Custom hooks in `src/hooks/` for reusable logic
- HeroUI components styled with UniwindCSS utilities for consistent design tokens

### Navigation Structure

Stack-based navigation with React Navigation v7. Main flow: WelcomeScreen → HomeScreen with nested navigators for Settings and Assistant Market.

### Internationalization

Supports 5 languages with strict validation. Use `t('key')` from react-i18next. Translation files in `src/i18n/locales/`. Scripts ensure consistency across all languages.

### File Organization

- Database schemas: `db/schema/` with `.sql` file imports
- Type definitions: `src/types/` with domain-specific files
- Configuration: `src/config/` for models and constants
- Utils: `src/utils/` for pure functions and helpers

## Development Notes

### Database Migrations

Always run `npx drizzle-kit generate` after schema changes. Database files are handled via Metro bundler configuration supporting `.sql` imports.

### AI Provider Integration

When adding new LLM providers, extend the `Provider` base class and implement required methods. Register in `ModelManager` with proper capability flags.

### State Updates

Use Redux Toolkit patterns. Most slices persist automatically except `runtime`. Handle async operations with createAsyncThunk.

**IMPORTANT**: When working with Redux state or SQLite database operations, always consult `docs/data.md` (or `docs/data-zh.md` for Chinese) for comprehensive data structure documentation including:

- Complete Redux store slice interfaces and relationships
- Full SQLite database schema with all tables and indexes
- Data flow patterns and entity relationships
- Storage considerations and persistence rules

### Testing

Jest with Expo preset configured. Place tests adjacent to source files with `.test.ts` suffix.

### Code Quality

ESLint enforces import sorting, unused import removal, and React Compiler optimizations. Prettier handles formatting. Both run automatically with `yarn format`.

### React Compiler Optimization

This project uses React Compiler for automatic performance optimization. Generally avoid `useCallback` and `useMemo` unless explicitly needed to express intent, as the compiler handles these optimizations automatically.

## Logging Standards

### Usage

```typescript
// Main process
import { loggerService } from '@/services/LoggerService'
const logger = loggerService.withContext('moduleName')

// Renderer process (set window source first)
loggerService.initWindowSource('windowName')
const logger = loggerService.withContext('moduleName')

// Logging
logger.info('message', CONTEXT)
logger.error('message', new Error('error'), CONTEXT)
```

### Log Levels (highest to lowest)

- `error` - Critical errors causing crash/unusable functionality
- `warn` - Potential issues that don't affect core functionality
- `info` - Application lifecycle and key user actions
- `verbose` - Detailed flow information for feature tracing
- `debug` - Development diagnostic info (not for production)
- `silly` - Extreme debugging, low-level information
