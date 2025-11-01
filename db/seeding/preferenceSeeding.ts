import { preferenceTable } from '@db/schema'
import { eq } from 'drizzle-orm'

import { DefaultPreferences, PreferenceDescriptions } from '@/shared/data/preference/preferenceSchemas'
import type { PreferenceKeyType } from '@/shared/data/preference/preferenceTypes'
import { uuid } from '@/utils'

/**
 * Seed the preference table with default values
 *
 * This function initializes all preferences defined in PreferenceSchemas
 * with their default values. It checks for existing preferences and only
 * inserts missing ones, preserving any user-modified values.
 *
 * Special handling:
 * - 'user.id': Generates a real UUID instead of using 'uuid()' placeholder
 *
 * @param db - The Drizzle database instance
 */
export async function seedPreferences(db: any) {
  console.log('[Seeding] Starting preference seeding...')

  const preferences = DefaultPreferences.default
  const descriptions = PreferenceDescriptions

  let insertedCount = 0
  let skippedCount = 0

  // Iterate through all default preferences
  for (const [key, defaultValue] of Object.entries(preferences)) {
    const prefKey = key as PreferenceKeyType

    try {
      // Check if preference already exists
      const existing = await db.select().from(preferenceTable).where(eq(preferenceTable.key, prefKey)).get()

      if (existing) {
        skippedCount++
        console.log(`[Seeding] Skipping existing preference: ${prefKey}`)
        continue
      }

      // Handle special cases
      let value = defaultValue

      // Generate actual UUID for user.id
      if (prefKey === 'user.id' && defaultValue === 'uuid()') {
        value = uuid()
        console.log(`[Seeding] Generated UUID for user.id: ${value}`)
      }

      // Insert new preference
      await db.insert(preferenceTable).values({
        key: prefKey,
        value: value as any, // Drizzle will handle JSON serialization
        description: descriptions[prefKey] || null
      })

      insertedCount++
      console.log(`[Seeding] Inserted preference: ${prefKey} = ${JSON.stringify(value)}`)
    } catch (error) {
      console.error(`[Seeding] Error seeding preference ${prefKey}:`, error)
      throw error
    }
  }

  console.log(
    `[Seeding] Preference seeding completed: ${insertedCount} inserted, ${skippedCount} skipped, ${insertedCount + skippedCount} total`
  )
}
