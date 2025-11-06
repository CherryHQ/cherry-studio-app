import { storage } from '@/utils'

/**
 * Simple key-value storage service using MMKV
 * Replaces window.keyv functionality for React Native
 */
class KeyValueService {
  /**
   * Get a value from storage
   */
  get<T = string>(key: string): T | undefined {
    try {
      const value = storage.getString(key)
      if (value === undefined) {
        return undefined
      }
      // Try to parse as JSON, fallback to string
      try {
        return JSON.parse(value) as T
      } catch {
        return value as T
      }
    } catch (error) {
      console.error(`Failed to get key ${key}:`, error)
      return undefined
    }
  }

  /**
   * Set a value in storage
   */
  set<T = string>(key: string, value: T): void {
    try {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value)
      storage.set(key, stringValue)
    } catch (error) {
      console.error(`Failed to set key ${key}:`, error)
    }
  }

  /**
   * Remove a value from storage
   */
  remove(key: string): void {
    try {
      storage.delete(key)
    } catch (error) {
      console.error(`Failed to remove key ${key}:`, error)
    }
  }

  /**
   * Check if a key exists in storage
   */
  has(key: string): boolean {
    return storage.contains(key)
  }

  /**
   * Clear all keys from storage
   */
  clear(): void {
    storage.clearAll()
  }
}

export const keyValueService = new KeyValueService()
export default keyValueService
