import { createContext, use, type PropsWithChildren, type ReactNode } from 'react';

import type { CherryMessagePart } from '@/shared/data/types/message';

type FileRenderer = (key: string, part: Extract<CherryMessagePart, { type: 'file' }>) => ReactNode;
const MessageFileRendererContext = createContext<FileRenderer | null>(null);

/** A source supplies file reads; shared message partitioning still owns placement. */
export function MessageFileRendererProvider({
  children,
  renderFile,
}: PropsWithChildren<{ renderFile: FileRenderer }>) {
  return <MessageFileRendererContext value={renderFile}>{children}</MessageFileRendererContext>;
}
export function useMessageFileRenderer() {
  return use(MessageFileRendererContext);
}
