import { createContext, type PropsWithChildren, use, useState } from 'react';

const SpeechPlaybackInsetContext = createContext(0);
const SetSpeechPlaybackInsetContext = createContext<((inset: number) => void) | null>(null);

/** Shares the active reading capsule's top clearance with scrollable content beneath headers. */
export function SpeechPlaybackInsetProvider({ children }: PropsWithChildren) {
  const [inset, setInset] = useState(0);

  return (
    <SetSpeechPlaybackInsetContext value={setInset}>
      <SpeechPlaybackInsetContext value={inset}>{children}</SpeechPlaybackInsetContext>
    </SetSpeechPlaybackInsetContext>
  );
}

/** Vertical clearance (px) reserved below the header when the reading capsule is visible. */
export function useSpeechPlaybackInset() {
  return use(SpeechPlaybackInsetContext);
}

export function useSetSpeechPlaybackInset() {
  return use(SetSpeechPlaybackInsetContext);
}
