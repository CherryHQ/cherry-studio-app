import { DREAMING_INSTRUCTIONS } from './memoryDreamingPlan';
import { DreamingError, type MemoryModel } from './memoryModel';
import type { MemoryRead } from './MemoryStore';

export function fitDreamingInputs(candidates: readonly MemoryRead[], resolved: MemoryModel) {
  const fit = (inputs: MemoryRead[]) => {
    const prompt = JSON.stringify({
      files: inputs.map(({ path, content }) => ({ path, content })),
    });
    const contentTokens = inputs.reduce(
      (total, file) => total + resolved.countTokens(file.content ?? ''),
      0,
    );
    const outputTokens = Math.max(2048, Math.ceil(contentTokens * 2 + 1024));
    const inputTokens = Math.ceil(
      resolved.countTokens(DREAMING_INSTRUCTIONS + prompt) * 1.25 + 512,
    );
    const bytes = inputs.reduce(
      (total, file) => total + new TextEncoder().encode(file.content ?? '').length,
      0,
    );
    if (
      bytes <= 50_000 &&
      inputs.length <= 10 &&
      outputTokens <= (resolved.maxOutputTokens ?? 4096) &&
      inputTokens <= (resolved.maxInputTokens ?? resolved.contextWindow!) &&
      inputTokens + outputTokens <= resolved.contextWindow!
    )
      return { inputs, prompt, outputTokens };
    return undefined;
  };
  const entry = candidates[0];
  let batch = entry && fit([entry]);
  if (!batch) throw new DreamingError('budget');
  const unfit: MemoryRead[] = [];
  for (const candidate of candidates.slice(1)) {
    const combined = fit([...batch.inputs, candidate]);
    if (combined) batch = combined;
    else if (!fit([entry, candidate])) unfit.push(candidate);
  }
  return { ...batch, unfit };
}
