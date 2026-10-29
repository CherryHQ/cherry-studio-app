import type { MermaidRenderResult } from './mermaidRenderer';

export type MermaidDocumentVariant = 'preview' | 'viewer';

type RenderedDiagram = Extract<MermaidRenderResult, { status: 'rendered' }>;

/**
 * A static page that displays rendered SVG. It runs no script and loads nothing: the display
 * WebView disables JavaScript, and the policy blocks every request the SVG could make.
 */
export function createMermaidDocument(diagram: RenderedDiagram, variant: MermaidDocumentVariant) {
  const { svg, width, height } = diagram;
  // The preview fits the diagram inside its frame without enlarging it; the viewer starts at the
  // screen width and leaves magnification to the platform's pinch zoom.
  const [viewport, style] =
    variant === 'preview'
      ? [
          'width=device-width, initial-scale=1, user-scalable=no',
          'html,body{margin:0;width:100%;height:100%;overflow:hidden}' +
            'body{display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:12px}' +
            `svg{display:block;width:100%!important;height:100%!important;max-width:${width}px!important;max-height:${height}px!important}`,
        ]
      : [
          'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=8, user-scalable=yes',
          'html,body{margin:0}' +
            'body{display:flex;min-height:100vh;align-items:center;justify-content:center;box-sizing:border-box;padding:16px}' +
            `svg{display:block;width:min(100%,${width}px)!important;height:auto!important;max-width:none!important}`,
        ];
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<meta name="viewport" content="${viewport}">` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:">` +
    `<style>html,body{background:transparent}${style}</style></head><body>${svg}</body></html>`
  );
}
