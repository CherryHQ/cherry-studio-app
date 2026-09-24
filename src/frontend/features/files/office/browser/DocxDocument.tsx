import { renderAsync } from 'docx-preview';
import { useEffect, useRef } from 'react';

import { officeDiagnostic } from '../officeDiagnostics';
import { clampOfficeZoom } from '../officePreview';
import { sanitizeDocumentLinks } from './documentSecurity';
import type { OfficeRendererProps } from './OfficeDocumentContent';
import { assertZipLimits } from './officeZipPreflight';

export function DocxDocument({ bytes, command, onStatus, fileName }: OfficeRendererProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const stylesRef = useRef<HTMLDivElement>(null);
  const lastCommandId = useRef<number | null>(null);
  const controls = useRef<{ zoom: (value: number) => void; page: (value: number) => void } | null>(
    null,
  );

  useEffect(() => {
    const scroll = scrollRef.current;
    const body = bodyRef.current;
    const styles = stylesRef.current;
    if (!scroll || !body || !styles) return;
    let cancelled = false;
    let resize: ResizeObserver | undefined;
    let intersection: IntersectionObserver | undefined;
    // Render out of view so a stale async result never replaces a new document.
    const staging = document.createElement('div');
    const stagingStyles = document.createElement('div');
    staging.className = 'office-staging';
    document.body.append(stagingStyles, staging);
    void (async () => {
      try {
        assertZipLimits(bytes, 'DOCX');
        await renderAsync(bytes, staging, stagingStyles, {
          className: 'docx-preview',
          inWrapper: true,
          breakPages: true,
          ignoreLastRenderedPageBreak: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          useBase64URL: true,
          renderAltChunks: false,
        });
        if (cancelled) return;
        sanitizeDocumentLinks(staging);
        body.replaceChildren(...staging.childNodes);
        styles.replaceChildren(...stagingStyles.childNodes);
        const pages = Array.from(body.querySelectorAll<HTMLElement>('section.docx-preview'));
        if (!pages.length) throw new Error('DOCX has no pages');
        let zoom = 100;
        const fit = () => {
          const pageWidth = Math.max(...pages.map((page) => page.offsetWidth));
          body.style.zoom = String(
            (Math.min(1, Math.max(1, scroll.clientWidth - 24) / Math.max(1, pageWidth)) * zoom) /
              100,
          );
        };
        controls.current = {
          zoom: (value) => {
            zoom = clampOfficeZoom(value);
            fit();
            onStatus({ zoom });
          },
          page: (value) =>
            pages[Math.min(pages.length, Math.max(1, value)) - 1]?.scrollIntoView({
              block: 'start',
            }),
        };
        fit();
        resize = new ResizeObserver(fit);
        resize.observe(scroll);
        const visible = new Set<Element>();
        intersection = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) visible.add(entry.target);
              else visible.delete(entry.target);
            }
            const current = pages.findIndex((page) => visible.has(page));
            if (current >= 0) onStatus({ page: current + 1 });
          },
          { root: scroll, threshold: [0, 0.5, 1] },
        );
        pages.forEach((page) => intersection?.observe(page));
        onStatus({ phase: 'ready', page: 1, pages: pages.length, zoom: 100 });
      } catch (error) {
        if (!cancelled)
          onStatus({
            phase: 'error',
            error: 'failed',
            diagnostic: officeDiagnostic('docx-render', error),
          });
      } finally {
        staging.remove();
        stagingStyles.remove();
      }
    })();
    return () => {
      cancelled = true;
      controls.current = null;
      resize?.disconnect();
      intersection?.disconnect();
      body.replaceChildren();
      styles.replaceChildren();
      staging.remove();
      stagingStyles.remove();
    };
  }, [bytes, onStatus]);

  useEffect(() => {
    if (!command || !controls.current || command.id === lastCommandId.current) return;
    lastCommandId.current = command.id;
    if (command.name === 'zoom') controls.current.zoom(command.value);
    if (command.name === 'page') controls.current.page(command.value);
    scrollRef.current?.focus({ preventScroll: true });
  }, [command]);

  return (
    <div className="office-scroll" ref={scrollRef} tabIndex={0} role="region" aria-label={fileName}>
      <div ref={stylesRef} />
      <div className="office-docx" ref={bodyRef} />
    </div>
  );
}
