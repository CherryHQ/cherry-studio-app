import { useEffect, useSyncExternalStore } from 'react';

import { mermaidRenderer, type MermaidRenderResult } from '../utils/mermaidRenderer';

/** The diagram's cached result, requesting a render when there is none yet. */
export function useMermaidRender(source: string, dark: boolean): MermaidRenderResult | undefined {
  const result = useSyncExternalStore(mermaidRenderer.subscribe, () =>
    mermaidRenderer.peek(source, dark),
  );
  useEffect(() => {
    if (!result) void mermaidRenderer.render(source, dark);
  }, [dark, result, source]);
  return result;
}
