import { isHttpUrl } from '@shared/utils/url';
import * as z from 'zod';

import {
  REPORT_ARTIFACTS_DESCRIPTION,
  REPORT_ARTIFACTS_TOOL_NAME,
  reportArtifactsInputSchema,
  WEB_FETCH_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  webFetchInputSchema,
} from '../builtinTools';

describe('builtin tool contracts', () => {
  it('uses model-facing builtin tool names', () => {
    expect(WEB_SEARCH_TOOL_NAME).toBe('web_search');
    expect(WEB_FETCH_TOOL_NAME).toBe('web_fetch');
    expect(REPORT_ARTIFACTS_TOOL_NAME).toBe('report_artifacts');
  });

  it('references the public web search tool name from fetch input metadata', () => {
    const description = webFetchInputSchema.shape.urls.description;

    expect(description).toContain(WEB_SEARCH_TOOL_NAME);
    expect(description).not.toContain('web__search');
  });

  it('keeps `format` out of the web_fetch schema so strict providers accept it', () => {
    // WebFetchTool runs with `strict: true`. Zod's `.url()` emits `format: "uri"`, which strict
    // OpenAI-compatible providers reject with a 400 that kills the whole request, not just this
    // tool ("Invalid schema for function 'web_fetch': ... 'uri' is not a valid format").
    // The http(s) contract is carried by a refinement, which `toJSONSchema` cannot express.
    // Whole-document rather than a `properties.urls.items.format` chain: an optional chain that
    // stops matching after a shape change would pass while `format` reappeared elsewhere.
    expect(JSON.stringify(z.toJSONSchema(webFetchInputSchema))).not.toContain('"format"');
    expect(webFetchInputSchema.safeParse({ urls: ['https://example.com'] }).success).toBe(true);
  });

  // Dropping `format` must not drop validation: the same schema is what the AI SDK checks a model
  // tool call against. Without this, `example.com` reaches `normalizeWebSearchUrls`, throws, and
  // `classifyWebLookupError` reports it as a *retryable network* error — so the model retries the
  // same bad input instead of being handed a repairable input error.
  it.each([
    ['a bare host', 'example.com'],
    ['a scheme-relative URL', '//example.com'],
    ['a non-http scheme', 'file:///etc/passwd'],
    ['a javascript URL', 'javascript:alert(1)'],
    ['prose', 'not a url'],
  ])('rejects %s in web_fetch input so the error stays an input error', (_label, url) => {
    expect(webFetchInputSchema.safeParse({ urls: [url] }).success).toBe(false);
  });

  it('still accepts the http(s) forms the model legitimately sends', () => {
    const urls = [
      'http://example.com',
      'https://example.com/a?b=1#c',
      '  https://example.com/pad  ',
    ];

    expect(webFetchInputSchema.safeParse({ urls }).success).toBe(true);
  });

  it('validates web_fetch urls with the same predicate the web search service enforces', () => {
    // The regression this guards against is the schema and the service disagreeing: whatever the
    // schema lets through must also survive `normalizeWebSearchUrls`, or the input error resurfaces
    // downstream as a fetch failure.
    for (const url of ['example.com', 'file:///etc/passwd', 'https://example.com']) {
      expect(webFetchInputSchema.safeParse({ urls: [url] }).success).toBe(isHttpUrl(url));
    }
  });

  it('validates final report artifacts', () => {
    const result = reportArtifactsInputSchema.parse({
      artifacts: [{ path: 'dist/report.pdf', description: 'Final report' }],
      summary: 'Generated report',
    });

    expect(result.artifacts[0]).toEqual({ path: 'dist/report.pdf', description: 'Final report' });
    expect(reportArtifactsInputSchema.safeParse({ artifacts: [] }).success).toBe(false);
    expect(reportArtifactsInputSchema.safeParse({ artifacts: [{ path: '   ' }] }).success).toBe(
      false,
    );
    expect(REPORT_ARTIFACTS_DESCRIPTION).toContain('final deliverable');
  });
});
