import { createContext, type ReactNode, use } from 'react';

/** Lets the host report the message whose failure detail the user is reading. */
const MessageFailureReportContext = createContext<
  ((messageId: string, destination?: 'feedback' | 'diagnosis') => void) | undefined
>(undefined);

export function MessageFailureReportProvider({
  children,
  onReport,
}: {
  children: ReactNode;
  onReport?: (messageId: string, destination?: 'feedback' | 'diagnosis') => void;
}) {
  return <MessageFailureReportContext value={onReport}>{children}</MessageFailureReportContext>;
}

export function useMessageFailureReport() {
  return use(MessageFailureReportContext);
}
