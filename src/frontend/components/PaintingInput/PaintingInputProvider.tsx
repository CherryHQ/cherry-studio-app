import { createContext, type PropsWithChildren, use, useCallback, useMemo, useState } from 'react';

import { useComposerState } from '@/frontend/components/Composer';
import type { ImageParamDraft } from '@/shared/utils/imageGenerationParams';

import { usePaintingReference, type PaintingInputResult } from './usePaintingReference';

type ParameterDraft = { modelId: string; values: ImageParamDraft };
type PaintingInputContextValue = {
  reference: ReturnType<typeof usePaintingReference>;
  parameterDrafts: Readonly<Record<string, ParameterDraft>>;
  lastParameterDraft: ParameterDraft | undefined;
  setParameterDraft(key: string, draft: ParameterDraft): void;
};
const PaintingInputContext = createContext<PaintingInputContextValue | null>(null);

/** Stays mounted across text/image controls, under the owning Composer session. */
export function PaintingInputProvider({
  children,
  result,
}: PropsWithChildren<{ result?: PaintingInputResult }>) {
  const { attachments, draft } = useComposerState();
  const reference = usePaintingReference(result, draft, attachments);
  const [parameters, setParameters] = useState<{
    drafts: Record<string, ParameterDraft>;
    last: ParameterDraft | undefined;
  }>({ drafts: {}, last: undefined });
  const setParameterDraft = useCallback((key: string, draft: ParameterDraft) => {
    setParameters((current) => {
      if (current.drafts[key]?.values === draft.values && current.last === current.drafts[key])
        return current;
      return { drafts: { ...current.drafts, [key]: draft }, last: draft };
    });
  }, []);
  const value = useMemo<PaintingInputContextValue>(
    () => ({
      reference,
      parameterDrafts: parameters.drafts,
      lastParameterDraft: parameters.last,
      setParameterDraft,
    }),
    [parameters, reference, setParameterDraft],
  );
  return <PaintingInputContext value={value}>{children}</PaintingInputContext>;
}

export function usePaintingInputSession() {
  const context = use(PaintingInputContext);
  if (!context) throw new Error('PaintingInput requires PaintingInputProvider');
  return context;
}
