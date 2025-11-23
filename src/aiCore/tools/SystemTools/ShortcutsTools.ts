import { tool } from 'ai'
import * as Linking from 'expo-linking'
import { AppState, Platform } from 'react-native'
import { z } from 'zod'

import { ShortcutCallbackManager, type ShortcutResult } from './ShortcutCallbackManager'

/**
 * Generate a unique callback ID for tracking shortcut executions
 */
function generateCallbackId(): string {
  return `shortcut_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Build iOS Shortcuts URL with x-callback-url parameters
 */
function buildShortcutURL(params: { name: string; input?: string; text?: string; callbackId: string }): string {
  const { name, input, text, callbackId } = params

  // Base callback URL using the app's custom scheme
  const baseCallbackURL = 'cherry-studio://shortcut-callback'

  // Build x-callback URLs
  const xSuccess = `${baseCallbackURL}?id=${encodeURIComponent(callbackId)}&result=`
  const xCancel = `${baseCallbackURL}?id=${encodeURIComponent(callbackId)}&cancelled=true`
  const xError = `${baseCallbackURL}?id=${encodeURIComponent(callbackId)}&error=`

  // Build query parameters
  const queryParams: Record<string, string> = {
    name: encodeURIComponent(name),
    'x-success': encodeURIComponent(xSuccess),
    'x-cancel': encodeURIComponent(xCancel),
    'x-error': encodeURIComponent(xError)
  }

  if (input) {
    queryParams.input = encodeURIComponent(input)
  }

  if (text) {
    queryParams.text = encodeURIComponent(text)
  }

  // Construct full URL
  const queryString = Object.entries(queryParams)
    .map(([key, value]) => `${key}=${value}`)
    .join('&')

  return `shortcuts://x-callback-url/run-shortcut?${queryString}`
}

/**
 * Run an iOS Shortcut and wait for the result
 */
export const runShortcut = tool({
  description: `Run an iOS Shortcut by name and return the result. This tool opens the iOS Shortcuts app, executes the specified shortcut, and waits for it to complete. Only works on iOS devices.

Examples:
- Run a shortcut named "Weather": { "name": "Weather" }
- Run a shortcut with text input: { "name": "Translate", "input": "text", "text": "Hello World" }

Note: The shortcut must exist in the user's Shortcuts library.`,
  inputSchema: z.object({
    name: z.string().describe('The exact name of the iOS Shortcut to run'),
    input: z.enum(['text', 'clipboard']).optional().describe('Type of input to pass to the shortcut (optional)'),
    text: z.string().optional().describe('Text content to pass as input (only used when input is "text")')
  }),
  execute: async ({ name, input, text }) => {
    // Check if running on iOS
    if (Platform.OS !== 'ios') {
      return {
        success: false,
        error: 'Shortcuts are only available on iOS devices'
      }
    }

    // Validate input parameters
    if (input === 'text' && !text) {
      return {
        success: false,
        error: 'Text input is required when input type is "text"'
      }
    }

    try {
      // Generate unique callback ID
      const callbackId = generateCallbackId()

      // Build shortcut URL
      const url = buildShortcutURL({
        name,
        input,
        text,
        callbackId
      })

      // Check if URL can be opened
      const canOpen = await Linking.canOpenURL(url)
      if (!canOpen) {
        return {
          success: false,
          error: 'Unable to open Shortcuts app. Make sure Shortcuts is installed on this device.'
        }
      }

      // Register callback and open URL
      const resultPromise = ShortcutCallbackManager.registerCallback(callbackId, 60000) // 60 second timeout

      // Create a promise that resolves when the app returns to the foreground
      const appStatePromise = new Promise<ShortcutResult>(resolve => {
        const subscription = AppState.addEventListener('change', nextAppState => {
          if (nextAppState === 'active') {
            subscription.remove()
            resolve({
              success: true,
              result: 'Shortcut execution completed (returned to app)'
            })
          }
        })
      })

      // Open the shortcut
      await Linking.openURL(url)

      // Wait for either the callback or the app to return to foreground
      const result = await Promise.race([resultPromise, appStatePromise])

      // If we got a result from AppState but the callback is still pending, we should cancel it to clean up
      if (result.result === 'Shortcut execution completed (returned to app)') {
        ShortcutCallbackManager.cancelCallback(callbackId)
      }

      if (result.cancelled) {
        return {
          success: false,
          message: `Shortcut "${name}" was cancelled by user`
        }
      }

      return {
        success: true,
        message: `Shortcut "${name}" executed successfully`,
        result: result.result || 'Shortcut completed with no output'
      }
    } catch (error) {
      if (error instanceof Error) {
        return {
          success: false,
          error: `Failed to run shortcut "${name}": ${error.message}`
        }
      }

      return {
        success: false,
        error: `Failed to run shortcut "${name}": Unknown error`
      }
    }
  }
})

/**
 * Combined export of all shortcuts tools as a ToolSet
 */
export const shortcutsTools = {
  RunShortcut: runShortcut
}
