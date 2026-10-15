import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useComposerActions, useComposerState } from '@/frontend/components/Composer';

import {
  preparePaintingAnnotationPrompts,
  type PaintingAnnotation,
} from '../utils/paintingAnnotations';

type AnnotationState = {
  /** Unsent annotations per image, so switching images and back keeps them. */
  byImage: Readonly<Record<string, readonly PaintingAnnotation[]>>;
  /** The whole-image request, kept aside while the composer edits an annotation. */
  generalDraft: string;
  imageKey: string | null;
  selectedId: number | null;
};

const noAnnotations: readonly PaintingAnnotation[] = [];

/**
 * Positional notes on the focused image. The composer has one text field, so
 * selecting an annotation swaps the field to that note's text and selecting
 * "whole image" swaps it back; typing always belongs to the current selection.
 * Changing the focused image saves the selected note and returns the field to
 * the whole-image request.
 */
export function usePaintingAnnotationDraft(imageKey: string | null) {
  const { t } = useTranslation();
  const { draft, isSubmitting } = useComposerState();
  const { setDraft } = useComposerActions();
  const [state, setState] = useState<AnnotationState>(() => ({
    byImage: {},
    generalDraft: draft,
    imageKey,
    selectedId: null,
  }));

  function savedSelection(current: AnnotationState): AnnotationState {
    if (current.selectedId === null || current.imageKey === null) {
      return { ...current, generalDraft: draft };
    }
    const annotations = current.byImage[current.imageKey] ?? noAnnotations;
    return {
      ...current,
      byImage: {
        ...current.byImage,
        [current.imageKey]: annotations.map((annotation) =>
          annotation.id === current.selectedId ? { ...annotation, text: draft } : annotation,
        ),
      },
    };
  }

  // Render-phase adjustment: the guard makes it converge in one extra pass.
  if (state.imageKey !== imageKey) {
    const saved = savedSelection(state);
    if (state.selectedId !== null) setDraft(saved.generalDraft);
    setState({ ...saved, imageKey, selectedId: null });
  }

  const annotations = (imageKey && state.byImage[imageKey]) || noAnnotations;

  function update(next: readonly PaintingAnnotation[], current: AnnotationState) {
    if (!current.imageKey) return current;
    return { ...current, byImage: { ...current.byImage, [current.imageKey]: next } };
  }

  return {
    annotations,
    isSubmitting,
    selectedId: state.selectedId,
    addAnnotation(x: number, y: number) {
      if (isSubmitting || !imageKey) return;
      const saved = savedSelection(state);
      const existing = saved.byImage[imageKey] ?? noAnnotations;
      const id = existing.reduce((highest, item) => Math.max(highest, item.id), 0) + 1;
      setState({ ...update([...existing, { id, text: '', x, y }], saved), selectedId: id });
      setDraft('');
    },
    selectAnnotation(id: number | null) {
      if (isSubmitting || id === state.selectedId) return;
      const saved = savedSelection(state);
      setState({ ...saved, selectedId: id });
      const current = (imageKey && saved.byImage[imageKey]) || noAnnotations;
      setDraft(
        id === null ? saved.generalDraft : (current.find((item) => item.id === id)?.text ?? ''),
      );
    },
    removeAnnotation(id: number) {
      if (isSubmitting) return;
      const saved = savedSelection(state);
      const remaining = annotations.filter((annotation) => annotation.id !== id);
      const wasSelected = state.selectedId === id;
      setState({
        ...update(remaining, saved),
        selectedId: wasSelected ? null : state.selectedId,
      });
      if (wasSelected) setDraft(saved.generalDraft);
    },
    /**
     * Freezes the request for submission: the model receives positional
     * instructions, the board shows the human brief.
     */
    preparePrompt(text: string) {
      const notes =
        state.selectedId === null
          ? annotations
          : annotations.map((annotation) =>
              annotation.id === state.selectedId ? { ...annotation, text } : annotation,
            );
      return preparePaintingAnnotationPrompts(
        t,
        state.selectedId === null ? text : state.generalDraft,
        notes,
      );
    },
    /** A sent request consumes the image's notes; a rejected one keeps them. */
    clearSubmitted(submittedKey: string) {
      setState((current) => {
        const byImage = { ...current.byImage };
        delete byImage[submittedKey];
        return {
          ...current,
          byImage,
          generalDraft: '',
          selectedId: current.imageKey === submittedKey ? null : current.selectedId,
        };
      });
    },
  };
}
