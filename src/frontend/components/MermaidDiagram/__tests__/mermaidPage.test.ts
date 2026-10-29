import { parseMermaidPageMessage } from '@cherrystudio/mermaid-webview/protocol';

import { createMermaidDocument } from '../utils/mermaidDocument';

describe('parseMermaidPageMessage', () => {
  test.each([
    ['{"type":"ready"}', { type: 'ready' }],
    ['{"type":"failed","id":3}', { type: 'failed', id: 3 }],
    [
      '{"type":"rendered","id":3,"svg":"<svg/>","width":10,"height":20}',
      { type: 'rendered', id: 3, svg: '<svg/>', width: 10, height: 20 },
    ],
  ])('accepts %s', (data, message) => {
    expect(parseMermaidPageMessage(data)).toEqual(message);
  });

  test.each([
    'not json',
    '{"type":"failed","id":"3"}',
    '{"type":"rendered","id":3,"svg":"<svg/>","width":0,"height":20}',
    '{"type":"rendered","id":3,"svg":"<svg/>","width":10}',
    `{"type":"rendered","id":3,"svg":"${'x'.repeat(1_048_577)}","width":10,"height":20}`,
  ])('rejects %#', (data) => {
    expect(parseMermaidPageMessage(data)).toBeUndefined();
  });
});

describe('createMermaidDocument', () => {
  const diagram = {
    status: 'rendered' as const,
    svg: '<svg id="d"></svg>',
    width: 640,
    height: 320,
  };

  test('blocks every request the displayed SVG could make', () => {
    for (const variant of ['preview', 'viewer'] as const) {
      const html = createMermaidDocument(diagram, variant);
      expect(html).toContain(
        `content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:"`,
      );
      expect(html).not.toContain('<script');
      expect(html).toContain('<body><svg id="d"></svg></body>');
    }
  });

  test('fits the preview without enlarging it and lets the viewer zoom', () => {
    const preview = createMermaidDocument(diagram, 'preview');
    const viewer = createMermaidDocument(diagram, 'viewer');

    expect(preview).toContain('user-scalable=no');
    expect(preview).toContain('max-width:640px!important;max-height:320px!important');
    expect(viewer).toContain('maximum-scale=8, user-scalable=yes');
    expect(viewer).toContain('width:min(100%,640px)!important');
  });
});
