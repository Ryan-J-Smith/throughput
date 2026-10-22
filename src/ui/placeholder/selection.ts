/** Toggle `id` in a selection, refusing to add beyond `max`. Returns a new array. */
export function toggleSelection(selected: readonly string[], id: string, max: number): readonly string[] {
  if (selected.includes(id)) return selected.filter((s) => s !== id);
  if (selected.length >= max) return selected;
  return [...selected, id];
}
