import { useCallback, useRef, useState } from 'react';

import type { PaintingAnnotation } from '../utils/paintingAnnotations';

type EditorImage = { id?: string; fileEntryId?: string; uri: string };

/** The attachment identity survives the album image's import into managed storage. */
function sourceKeys(image: EditorImage) {
  return [
    ...(image.fileEntryId ? [`file:${image.fileEntryId}`] : []),
    ...(image.id ? [`attachment:${image.id}`] : []),
    `uri:${image.uri}`,
  ];
}

export function usePaintingEditor(initialImage: EditorImage | null) {
  const [output, setOutput] = useState(initialImage);
  const [isOpen, setIsOpen] = useState(Boolean(initialImage));
  const [initialAnnotations, setInitialAnnotations] = useState<readonly PaintingAnnotation[]>([]);
  const drafts = useRef(new Map<string, readonly PaintingAnnotation[]>());
  const getAnnotations = useCallback(
    (image: EditorImage) =>
      sourceKeys(image)
        .map((key) => drafts.current.get(key))
        .find(Boolean) ?? [],
    [],
  );
  const open = useCallback(
    (image: EditorImage) => {
      setInitialAnnotations(getAnnotations(image));
      setOutput(image);
      setIsOpen(true);
    },
    [getAnnotations],
  );
  const close = useCallback(() => setIsOpen(false), []);
  const saveAnnotations = useCallback(
    (annotations: readonly PaintingAnnotation[]) => {
      if (output) for (const key of sourceKeys(output)) drafts.current.set(key, annotations);
    },
    [output],
  );
  return { output, isOpen, initialAnnotations, open, close, getAnnotations, saveAnnotations };
}
