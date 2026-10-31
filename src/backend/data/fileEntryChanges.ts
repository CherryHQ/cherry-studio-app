import { publishDataApiChanges } from './dataApiChanges';

/** One committed batch serves resource queries and file-dependent projections alike. */
export function publishFileEntryChanges(
  ids: readonly string[],
  paths: readonly string[] = [],
): void {
  publishDataApiChanges([
    ...new Set([
      '/files/library',
      '/files/history',
      '/trash',
      '/trash/summary',
      ...paths,
      ...ids.map((id) => `/files/entries/${id}`),
    ]),
  ]);
}
