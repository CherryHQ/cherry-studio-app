import * as z from 'zod';

export const nullableString = z.string().nullable();
export const nullableNumber = z.number().nullable();

export const locationOutputSchema = z
  .object({
    address: z
      .object({
        city: nullableString,
        country: nullableString,
        district: nullableString,
        formattedAddress: nullableString,
        isoCountryCode: nullableString,
        name: nullableString,
        postalCode: nullableString,
        region: nullableString,
        street: nullableString,
        subregion: nullableString,
      })
      .nullable(),
    coords: z.object({
      accuracy: nullableNumber,
      altitude: nullableNumber,
      altitudeAccuracy: nullableNumber,
      heading: nullableNumber,
      latitude: z.number(),
      longitude: z.number(),
      speed: nullableNumber,
    }),
    timestamp: z.string(),
  })
  .strict();

export const collectionOutputSchema = z
  .object({
    accessLevel: z.unknown().nullable(),
    allowsModifications: z.boolean(),
    color: nullableString,
    entityType: z.unknown().nullable(),
    id: z.string(),
    isPrimary: z.boolean().nullable(),
    isVisible: z.boolean().nullable(),
    ownerAccount: nullableString,
    source: z.object({ name: nullableString, type: z.unknown().nullable() }).nullable(),
    title: z.string(),
  })
  .strict();

export const calendarEventOutputSchema = z
  .object({
    allDay: z.boolean(),
    availability: z.unknown().nullable(),
    calendarId: z.string(),
    endDate: nullableString,
    id: z.string(),
    location: nullableString,
    notes: nullableString,
    startDate: nullableString,
    status: z.unknown().nullable(),
    timeZone: nullableString,
    title: z.string(),
    url: nullableString,
  })
  .strict();

export const reminderOutputSchema = z
  .object({
    calendarId: z.string(),
    completed: z.boolean(),
    completionDate: nullableString,
    dueDate: nullableString,
    id: z.string(),
    location: nullableString,
    notes: nullableString,
    startDate: nullableString,
    timeZone: nullableString,
    title: z.string(),
    url: nullableString,
  })
  .strict();

export const mutationOutputSchema = z
  .object({
    deleted: z.boolean(),
    id: z.string(),
  })
  .strict();

export const updateOutputSchema = z.object({ id: z.string(), updated: z.boolean() }).strict();

const metricValueSchema = z.object({ unit: z.string(), value: z.number() }).strict();
export const healthSummaryOutputSchema = z
  .object({
    data: z.union([
      z.record(z.string(), metricValueSchema),
      z.array(
        z.object({ date: z.string(), metrics: z.record(z.string(), metricValueSchema) }).strict(),
      ),
    ]),
    endDate: z.string(),
    granularity: z.enum(['summary', 'day']),
    startDate: z.string(),
  })
  .strict();

export const workoutOutputSchema = z
  .object({
    activityName: z.string(),
    activityType: z.number(),
    durationSeconds: z.number(),
    endDate: nullableString,
    startDate: nullableString,
    totalDistanceMeters: nullableNumber,
    totalEnergyKilocalories: nullableNumber,
  })
  .strict();
