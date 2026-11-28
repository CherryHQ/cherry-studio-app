import { createContext } from 'react';

export type RemoteSessionSheetTarget = { connectionId: string; agentId?: string } & (
  | { sessionId: string }
  | { draftId: string; operationId?: string }
);

export const OpenRemoteSessionSheetContext = createContext<
  ((target: RemoteSessionSheetTarget) => void) | undefined
>(undefined);
