import { createContext, type PropsWithChildren, type ReactNode, use } from 'react';

import type { ToolMessagePart } from './toolPartState';

type ToolRenderer = (part: ToolMessagePart) => ReactNode;
const ToolRendererContext = createContext<ToolRenderer | null>(null);

/** Lets a source own tool detail loading while keeping the shared process layout. */
export function ToolRendererProvider({
  children,
  renderTool,
}: PropsWithChildren<{ renderTool: ToolRenderer }>) {
  return <ToolRendererContext value={renderTool}>{children}</ToolRendererContext>;
}

export function useToolRenderer() {
  return use(ToolRendererContext);
}
