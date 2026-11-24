/** Yields to the runtime task queue so long chunked loops do not starve UI or I/O work. */
export function yieldToRuntime(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
