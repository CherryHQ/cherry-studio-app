import { createContext, type PropsWithChildren, use, useMemo, useState } from 'react';

import type { PairDesktopConnectionDto } from '@/shared/data/api/schemas/desktopConnections';

const PairingInputContext = createContext<{
  input: PairDesktopConnectionDto | null;
  setInput: (input: PairDesktopConnectionDto | null) => void;
} | null>(null);

export function DesktopPairingProvider({ children }: PropsWithChildren) {
  const [input, setInput] = useState<PairDesktopConnectionDto | null>(null);
  const value = useMemo(() => ({ input, setInput }), [input]);
  return <PairingInputContext value={value}>{children}</PairingInputContext>;
}

export function useDesktopPairingInput() {
  const context = use(PairingInputContext);
  if (!context) throw new Error('DesktopPairingProvider is required');
  return context;
}
