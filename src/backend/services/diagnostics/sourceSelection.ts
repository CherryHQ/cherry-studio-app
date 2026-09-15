import { DIAGNOSTIC_SOURCE_LIMIT_BYTES } from '@/shared/contracts/diagnostics';

import type { SourceCandidate } from './types';

/** Keep representation of both sources, then use the remaining budget for recent files. */
export function selectBundleSources(
  candidates: readonly SourceCandidate[],
  limitBytes = DIAGNOSTIC_SOURCE_LIMIT_BYTES,
) {
  const sorted = [...candidates].sort(
    (a, b) => b.latestAt - a.latestAt || a.archiveName.localeCompare(b.archiveName),
  );
  const representatives = ['logs', 'traces'].flatMap((kind) => {
    const first = sorted.find((candidate) => candidate.kind === kind);
    return first ? [first] : [];
  });
  const selected = new Set<SourceCandidate>();
  let remaining = limitBytes;
  for (const candidate of [
    ...representatives,
    ...sorted.filter((file) => !representatives.includes(file)),
  ]) {
    if (candidate.eligibleBytes > remaining) continue;
    selected.add(candidate);
    remaining -= candidate.eligibleBytes;
  }
  return {
    selectedFiles: sorted.filter((file) => selected.has(file)),
    omittedFiles: sorted.filter((file) => !selected.has(file)),
  };
}
