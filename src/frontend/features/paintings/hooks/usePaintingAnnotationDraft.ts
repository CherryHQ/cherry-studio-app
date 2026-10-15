import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useComposerActions, useComposerState } from '@/frontend/components/Composer';
import type { PaintingInputSubmission } from '@/frontend/components/PaintingInput';

import {
  preparePaintingAnnotationPrompts,
  type PaintingAnnotation,
} from '../utils/paintingAnnotations';

/** Keep the draft's annotation identity fixed until send recovery has finished. */
export function usePaintingAnnotationDraft({
  initialAnnotations,
  onAnnotationsChange,
  onClose,
  onGenerate,
}: {
  initialAnnotations: readonly PaintingAnnotation[];
  onAnnotationsChange: (annotations: readonly PaintingAnnotation[]) => void;
  onClose: () => void;
  onGenerate: (input: PaintingInputSubmission) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const { draft, isSubmitting } = useComposerState();
  const { setDraft } = useComposerActions();
  const [annotations, setAnnotations] = useState(initialAnnotations);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [generalDraft, setGeneralDraft] = useState(draft);
  const submittedAnnotations = useRef<readonly PaintingAnnotation[] | null>(null);
  const latest = useRef<{ draft: string; annotations: readonly PaintingAnnotation[] } | null>(null);
  useLayoutEffect(() => {
    latest.current = { draft, annotations };
    return () => {
      latest.current = null;
    };
  }, [draft, annotations]);

  function updateAnnotations(next: readonly PaintingAnnotation[]) {
    setAnnotations(next);
    onAnnotationsChange(next);
  }

  function saveCurrentDraft() {
    if (selectedId === null) {
      setGeneralDraft(draft);
      return annotations;
    }
    const next = annotations.map((annotation) =>
      annotation.id === selectedId ? { ...annotation, text: draft } : annotation,
    );
    updateAnnotations(next);
    return next;
  }

  return {
    annotations,
    selectedId,
    isSubmitting,
    selectAnnotation(id: number | null) {
      if (isSubmitting || id === selectedId) return;
      const saved = saveCurrentDraft();
      setSelectedId(id);
      setDraft(id === null ? generalDraft : (saved.find((item) => item.id === id)?.text ?? ''));
    },
    addAnnotation(x: number, y: number) {
      if (isSubmitting) return;
      const saved = saveCurrentDraft();
      const id = saved.reduce((highest, item) => Math.max(highest, item.id), 0) + 1;
      updateAnnotations([...saved, { id, x, y, text: '' }]);
      setSelectedId(id);
      setDraft('');
    },
    removeSelectedAnnotation() {
      if (isSubmitting || selectedId === null) return;
      updateAnnotations(annotations.filter((annotation) => annotation.id !== selectedId));
      setSelectedId(null);
      setDraft(generalDraft);
    },
    close() {
      if (isSubmitting) return;
      saveCurrentDraft();
      if (selectedId !== null) setDraft(generalDraft);
      setSelectedId(null);
      onClose();
    },
    preparePrompt(text: string) {
      const next =
        selectedId === null
          ? annotations
          : annotations.map((annotation) =>
              annotation.id === selectedId ? { ...annotation, text } : annotation,
            );
      updateAnnotations(next);
      submittedAnnotations.current = next;
      return preparePaintingAnnotationPrompts(t, selectedId === null ? text : generalDraft, next);
    },
    async generate(input: PaintingInputSubmission) {
      const result = await onGenerate(input);
      if (
        result &&
        latest.current &&
        !latest.current.draft &&
        latest.current.annotations === submittedAnnotations.current
      )
        onClose();
      return result;
    },
  };
}
