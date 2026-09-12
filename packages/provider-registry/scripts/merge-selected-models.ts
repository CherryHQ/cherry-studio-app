/** Update selected generated models while retaining the rest of the bundled catalog. */
export function mergeSelectedModels<T extends { id: string }>(
  existing: readonly T[],
  generated: readonly T[],
  selectedIds: readonly string[],
): T[] {
  const selected = new Set(selectedIds);
  const generatedById = new Map(generated.map((model) => [model.id, model]));
  const replacements = [...selected].map((id) => {
    const model = generatedById.get(id);
    if (!model) {
      throw new Error(`Cannot regenerate unknown model: ${id}`);
    }
    return model;
  });

  return [...existing.filter((model) => !selected.has(model.id)), ...replacements];
}
