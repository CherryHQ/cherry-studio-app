import type { HttpQuery } from './HttpClient';

/**
 * Serializes query parameters in standard repeated-key form (`tag=a&tag=b`),
 * omitting `null` and `undefined` values. The wire format is owned by this
 * module rather than by the Axios default serializer.
 */
export function serializeHttpQuery(query: HttpQuery): string {
  const searchParams = new URLSearchParams();

  for (const [name, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item === null || item === undefined) {
        continue;
      }
      searchParams.append(name, String(item));
    }
  }

  return searchParams.toString();
}
