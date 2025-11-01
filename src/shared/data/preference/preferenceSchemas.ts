/**
 * Preference Schemas and Default Values
 *
 * This file defines all user preferences and their default values.
 * Preferences are stored in the SQLite database and can be synchronized across devices.
 *
 * Total preference items: 10
 * - User configuration: 3
 * - UI configuration: 1
 * - Topic state: 1
 * - Web search configuration: 4
 * - App state: 2
 */

import { ThemeMode } from '@/types'

import type { PreferenceSchemas } from './preferenceTypes'

/**
 * Default preference values
 * These will be used during database seeding and as fallback values
 */
export const DefaultPreferences: PreferenceSchemas = {
  default: {
    // === User Configuration ===
    // User avatar image path or URL
    'user.avatar': '',

    // User display name shown in the application
    'user.name': 'Cherry Studio',

    // Unique user identifier (UUID)
    // Will be generated during seeding with actual UUID
    'user.id': 'uuid()',

    // === UI Configuration ===
    // Application theme mode
    // - light: Light theme
    // - dark: Dark theme
    // - system: Follow system theme preference
    'ui.theme_mode': ThemeMode.system,

    // === Topic State ===
    // Currently active conversation topic ID
    // Empty string means no active topic
    'topic.current_id': '',

    // === Web Search Configuration ===
    // Whether to add current date to search queries
    // Helps get more recent and relevant results
    'websearch.search_with_time': true,

    // Maximum number of search results to retrieve
    // Valid range: 1-20, default is 5
    'websearch.max_results': 5,

    // Whether to override the default search service settings
    // When true, uses custom search configuration
    'websearch.override_search_service': true,

    // Content length limit for search results (in characters)
    // undefined means no limit
    'websearch.content_limit': 2000,

    // Current version of the app data initialization
    // Used to run incremental initialization migrations when new data is added
    'app.initialization_version': 0
  }
}

/**
 * Preference descriptions for documentation and UI display
 * Maps preference keys to human-readable descriptions
 */
export const PreferenceDescriptions: Record<keyof PreferenceSchemas['default'], string> = {
  'user.avatar': 'User avatar image path or URL',
  'user.name': 'User display name',
  'user.id': 'Unique user identifier (UUID)',
  'ui.theme_mode': 'Application theme mode (light/dark/system)',
  'topic.current_id': 'Currently active conversation topic ID',
  'websearch.search_with_time': 'Add current date to search queries for recent results',
  'websearch.max_results': 'Maximum number of search results (1-20)',
  'websearch.override_search_service': 'Use custom search service configuration',
  'websearch.content_limit': 'Content length limit for search results (characters)',
  'app.initialization_version': 'Current version of app data initialization migrations'
}
