import {
  buildPresentation,
  parseZipLazyMedia,
  PptxViewer,
  RECOMMENDED_ZIP_LIMITS,
} from '@aiden0z/pptx-renderer';
import type { PresentationData } from '@aiden0z/pptx-renderer';
import { useEffect, useRef } from 'react';

import { officeDiagnostic } from '../officeDiagnostics';
import { clampOfficeZoom } from '../officePreview';
import type { OfficeRendererProps } from './OfficeDocumentContent';

// Same filtering as desktop: remote images, video and audio are never fetched.
function stripExternalMedia(presentation: PresentationData) {
  for (const part of [
    ...presentation.slides,
    ...presentation.layouts.values(),
    ...presentation.masters.values(),
  ]) {
    for (const [id, rel] of part.rels) {
      if (
        rel.targetMode?.trim().toLowerCase() === 'external' &&
        ['image', 'audio', 'video', 'media'].includes(
          rel.type.trim().toLowerCase().split('/').at(-1) ?? '',
        )
      ) {
        part.rels.delete(id);
      }
    }
  }
}

export function PptxDocument({ bytes, command, onStatus, fileName }: OfficeRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PptxViewer | null>(null);
  const busyRef = useRef(false);
  const lastCommandId = useRef<number | null>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let viewer: PptxViewer | undefined;
    void (async () => {
      try {
        const files = await parseZipLazyMedia(bytes.buffer, RECOMMENDED_ZIP_LIMITS);
        if (cancelled) return;
        const presentation = buildPresentation(files, { lazySlides: true });
        stripExternalMedia(presentation);
        viewer = new PptxViewer(container, {
          fitMode: 'contain',
          zoomPercent: 100,
          scrollContainer: container,
          zipLimits: RECOMMENDED_ZIP_LIMITS,
          lazyMedia: true,
          lazySlides: true,
          pdfjs: false,
          onSlideChange: (index) => {
            if (!cancelled) onStatus({ page: index + 1 });
          },
          onRenderStart: () => {
            busyRef.current = true;
            if (!cancelled) onStatus({ busy: true });
          },
          onRenderComplete: () => {
            busyRef.current = false;
            if (!cancelled) onStatus({ busy: false });
          },
          onSlideError: (_index, error) => {
            if (!cancelled)
              onStatus({ warning: true, diagnostic: officeDiagnostic('pptx-slide', error) });
          },
          onNodeError: (_id, error) => {
            if (!cancelled)
              onStatus({ warning: true, diagnostic: officeDiagnostic('pptx-node', error) });
          },
        });
        viewerRef.current = viewer;
        viewer.load(presentation);
        await viewer.renderList({
          windowed: true,
          batchSize: 2,
          initialSlides: 2,
          overscanViewport: 1,
        });
        if (cancelled) return;
        if (!viewer.slideCount) throw new Error('PPTX has no slides');
        onStatus({
          phase: 'ready',
          page: viewer.currentSlideIndex + 1,
          pages: viewer.slideCount,
          zoom: 100,
          busy: false,
        });
      } catch (error) {
        if (!cancelled) {
          viewer?.destroy();
          viewerRef.current = null;
          onStatus({
            phase: 'error',
            error: 'failed',
            diagnostic: officeDiagnostic('pptx-render', error),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      viewerRef.current = null;
      viewer?.destroy();
      container.replaceChildren();
    };
  }, [bytes, onStatus]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (
      !viewer ||
      !command ||
      command.name === 'sheet' ||
      busyRef.current ||
      command.id === lastCommandId.current
    )
      return;
    lastCommandId.current = command.id;
    busyRef.current = true;
    onStatus({ busy: true });
    const action =
      command.name === 'zoom'
        ? viewer.setZoom(clampOfficeZoom(command.value))
        : viewer.goToSlide(Math.min(viewer.slideCount, Math.max(1, command.value)) - 1, {
            block: 'center',
          });
    void action
      .then(() => {
        if (viewerRef.current === viewer) {
          onStatus({ zoom: viewer.zoomPercent, page: viewer.currentSlideIndex + 1 });
          containerRef.current?.focus({ preventScroll: true });
        }
      })
      .catch((error) => {
        if (viewerRef.current === viewer)
          onStatus({ warning: true, diagnostic: officeDiagnostic('pptx-command', error) });
      })
      .finally(() => {
        busyRef.current = false;
        if (viewerRef.current === viewer) onStatus({ busy: false });
      });
  }, [command, onStatus]);

  return (
    <div
      className="office-scroll office-pptx"
      ref={containerRef}
      tabIndex={0}
      role="region"
      aria-label={fileName}
    />
  );
}
