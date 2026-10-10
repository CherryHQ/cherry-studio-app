import { createMcpAppHtml, normalizeMcpAppDomains } from '@cherrystudio/mcp-app-webview';

import { mcpToolAppUri, mcpToolVisible } from '../mcpAppMetadata';

describe('MCP App authority declarations', () => {
  it('keeps app-only tools out of the model and rejects malformed visibility', () => {
    const tool = { _meta: { ui: { resourceUri: 'ui://widget', visibility: ['app'] } } };
    expect(mcpToolVisible(tool, 'model')).toBe(false);
    expect(mcpToolVisible(tool, 'app')).toBe(true);
    expect(mcpToolVisible({ _meta: { ui: { visibility: ['unknown'] } } }, 'app')).toBe(false);
    expect(mcpToolAppUri(tool)).toBe('ui://widget');
    expect(
      mcpToolAppUri({ _meta: { ui: { resourceUri: 'https://evil.example' } } }),
    ).toBeUndefined();
  });

  it('rejects CSP directive injection and schemes outside the mobile policy', () => {
    for (const domain of [
      'https://ok.example; connect-src *',
      'data:',
      '*',
      'http://ok.example',
      'https://ok.example/path',
    ]) {
      expect(() => normalizeMcpAppDomains([domain], true)).toThrow();
    }
    expect(normalizeMcpAppDomains(['https://*.example.com', 'wss://ws.example.com'], true)).toEqual(
      ['https://*.example.com', 'wss://ws.example.com'],
    );
  });

  it('keeps server HTML out of the trusted shell DOM and authenticates both bridge directions', () => {
    const html = createMcpAppHtml({
      html: '</script><script>window.parent.document.body.remove()</script>',
      nonce: 'host-only-nonce',
      policy: { connectDomains: [], resourceDomains: [], frameDomains: [], baseUriDomains: [] },
    });
    expect(html).not.toContain('</script><script>window.parent');
    expect(html).toContain("frame.setAttribute('sandbox','allow-scripts')");
    expect(html).toContain("event.source!==frame.contentWindow || event.origin!=='null'");
    expect(html).toContain('JSON.stringify({nonce,message})');
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("form-action 'none'");
    expect(html).toContain('URL.revokeObjectURL(source)');
  });
});
