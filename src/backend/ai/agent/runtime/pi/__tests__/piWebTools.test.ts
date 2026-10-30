import type { RuntimeTool, RuntimeWebTools } from '../../types';
import { applyPiWebTools, resolvePiWebToolRoutes, selectPiClientTools } from '../piWebTools';

const policy: RuntimeWebTools = {
  modelToolsPreferred: true,
  clientSearchAvailable: true,
  clientFetchAvailable: true,
};
const native = { search: true, fetch: true, functionToolMixing: true };
const tool = (name: string, approval: RuntimeTool['approval'] = 'auto'): RuntimeTool => ({
  ref: { source: 'builtin', capabilityId: name },
  providerName: name,
  displayName: name,
  description: name,
  inputSchema: { type: 'object' },
  approval,
  execute: async () => ({ value: [], artifacts: [] }),
});
const tools = [tool('web_search'), tool('web_fetch')];

describe('Pi web tool selection', () => {
  test.each([
    [true, { search: 'server', fetch: 'server' }],
    [false, { search: 'client', fetch: 'client' }],
  ] as const)(
    'selects one source per capability for model preference %s',
    (modelToolsPreferred, expected) => {
      const routes = resolvePiWebToolRoutes({ ...policy, modelToolsPreferred }, native, tools);
      expect(routes).toEqual(expected);
      expect(selectPiClientTools(tools, routes)).toHaveLength(modelToolsPreferred ? 0 : 2);
    },
  );

  test('combines native search with external page reading when the adapter allows functions', () => {
    expect(resolvePiWebToolRoutes(policy, { ...native, fetch: false }, tools)).toEqual({
      search: 'server',
      fetch: 'client',
    });
  });

  test('falls back before sending when the preferred external service lacks configuration', () => {
    expect(
      resolvePiWebToolRoutes(
        { ...policy, modelToolsPreferred: false, clientSearchAvailable: false },
        native,
        tools,
      ),
    ).toEqual({ search: 'server', fetch: 'client' });
  });

  test('keeps unsupported endpoints external and never enables native tools without Host policy', () => {
    expect(resolvePiWebToolRoutes(policy, undefined, tools)).toEqual({
      search: 'client',
      fetch: 'client',
    });
    expect(resolvePiWebToolRoutes(undefined, native, [])).toEqual({
      search: 'client',
      fetch: 'client',
    });
    expect(applyPiWebTools({}, undefined, { search: 'server', fetch: 'none' })).toEqual({});
  });

  test('keeps per-call approval and explicit denies effective', () => {
    expect(
      resolvePiWebToolRoutes(policy, native, [
        tool('web_search', 'ask'),
        tool('web_fetch', 'deny'),
      ]),
    ).toEqual({ search: 'client', fetch: 'none' });
    expect(
      resolvePiWebToolRoutes({ ...policy, clientSearchAvailable: false }, native, [
        tool('web_search', 'ask'),
      ]).search,
    ).toBe('none');
  });

  test('older Gemini falls back when another function is in the request', () => {
    const routes = resolvePiWebToolRoutes(policy, { ...native, functionToolMixing: false }, [
      ...tools,
      tool('read_file'),
    ]);
    expect(routes).toEqual({ search: 'client', fetch: 'client' });
  });

  test('pairs Qwen Anthropic fetch with search while respecting approvals and denies', () => {
    const qwen = { ...native, dialect: 'qwen-anthropic' as const };
    const preferClient = { ...policy, modelToolsPreferred: false, clientFetchAvailable: false };
    expect(resolvePiWebToolRoutes(preferClient, qwen, tools)).toEqual({
      search: 'server',
      fetch: 'server',
    });
    for (const approval of ['ask', 'deny'] as const) {
      const guarded = [tool('web_search', approval), tool('web_fetch')];
      expect(resolvePiWebToolRoutes(policy, qwen, guarded)).toEqual({
        search: approval === 'ask' ? 'client' : 'none',
        fetch: 'client',
      });
      expect(resolvePiWebToolRoutes(preferClient, qwen, guarded).fetch).toBe('none');
    }
  });

  test('does not mix native and external web tools on older Gemini', () => {
    expect(
      resolvePiWebToolRoutes(policy, { ...native, fetch: false, functionToolMixing: false }, tools),
    ).toEqual({ search: 'client', fetch: 'client' });
    expect(resolvePiWebToolRoutes(policy, { ...native, functionToolMixing: false }, tools)).toEqual(
      { search: 'server', fetch: 'server' },
    );
  });

  test('does not advertise unconfigured services when neither path is available', () => {
    const routes = resolvePiWebToolRoutes(
      { ...policy, clientSearchAvailable: false, clientFetchAvailable: false },
      undefined,
      tools,
    );
    expect(routes).toEqual({ search: 'none', fetch: 'none' });
    expect(selectPiClientTools(tools, routes)).toEqual([]);
  });
});

describe('native request adapters', () => {
  const routes = { search: 'server', fetch: 'server' } as const;
  const functions = [{ type: 'function', name: 'read_file' }];

  test('retain function tools and generation parameters', () => {
    expect(applyPiWebTools({ tools: functions }, 'openai-responses', routes)).toEqual({
      tools: [...functions, { type: 'web_search' }],
    });
    expect(applyPiWebTools({ tools: functions }, 'openai-preview', routes)).toEqual({
      tools: [...functions, { type: 'web_search_preview' }],
    });
    expect(applyPiWebTools({}, 'xai', routes)).toEqual({
      tools: [
        { type: 'web_search', enable_image_understanding: true },
        { type: 'x_search', enable_image_understanding: true },
      ],
    });
    const none = { search: 'none', fetch: 'none' } as const;
    const request = { tools: functions };
    expect(applyPiWebTools(request, 'openai-responses', none)).toBe(request);
  });

  test('Gemini turns on server-side tool invocations only beside functions', () => {
    const alone = { model: 'gemini-2.5-flash', config: { temperature: 0.5 } };
    expect(applyPiWebTools(alone, 'google', routes)).toEqual({
      ...alone,
      config: { temperature: 0.5, tools: [{ googleSearch: {} }, { urlContext: {} }] },
    });
    const declarations = { functionDeclarations: [{ name: 'read_file' }] };
    expect(
      applyPiWebTools(
        {
          config: { tools: [declarations], toolConfig: { functionCallingConfig: { mode: 'ANY' } } },
        },
        'google',
        { search: 'server', fetch: 'client' },
      ),
    ).toEqual({
      config: {
        tools: [declarations, { googleSearch: {} }],
        toolConfig: {
          functionCallingConfig: { mode: 'ANY' },
          includeServerSideToolInvocations: true,
        },
      },
    });
  });

  test('Anthropic adds versioned server tools and the beta its page reader needs', () => {
    expect(applyPiWebTools({ tools: functions, betas: ['existing'] }, 'anthropic', routes)).toEqual(
      {
        tools: [
          ...functions,
          { type: 'web_search_20250305', name: 'web_search', max_uses: 5 },
          {
            type: 'web_fetch_20250910',
            name: 'web_fetch',
            max_uses: 5,
            max_content_tokens: 4_000,
          },
        ],
        betas: ['existing', 'web-fetch-2025-09-10'],
      },
    );
    expect(applyPiWebTools({}, 'anthropic', { search: 'server', fetch: 'client' })).toEqual({
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
    });
  });

  test('Chat Completions hosts use their own search switch', () => {
    const search = { search: 'server', fetch: 'client' } as const;
    expect(applyPiWebTools({ tools: functions }, 'zhipu', search)).toEqual({
      tools: [
        ...functions,
        {
          type: 'web_search',
          web_search: { enable: true, search_engine: 'search_pro', search_result: true },
        },
      ],
    });
    expect(applyPiWebTools({ model: 'qwen-plus' }, 'dashscope', search)).toEqual({
      model: 'qwen-plus',
      enable_search: true,
      search_options: { enable_source: true },
    });
    expect(applyPiWebTools({ model: 'qwen3-max' }, 'dashscope', search)).toMatchObject({
      search_options: { search_strategy: 'agent' },
    });
    expect(applyPiWebTools({}, 'openrouter', search)).toEqual({
      tools: [{ type: 'openrouter:web_search' }],
    });
    const sonar = { model: 'sonar' };
    expect(applyPiWebTools(sonar, 'perplexity', search)).toBe(sonar);
  });

  test('Qwen Anthropic adds its system identifier without changing cached prompt blocks', () => {
    const system = [
      { type: 'text', text: 'User instructions', cache_control: { type: 'ephemeral' } },
    ];
    const body = { system, tools: functions, temperature: 0.5 };
    const prepared = applyPiWebTools(body, 'qwen-anthropic', routes) as typeof body;
    expect(prepared).toMatchObject({
      system: [{ type: 'text', text: 'x-anthropic-billing-header: cc_entrypoint=cli;' }, ...system],
      temperature: 0.5,
      tools: expect.arrayContaining([
        ...functions,
        expect.objectContaining({ name: 'web_search' }),
        expect.objectContaining({ name: 'web_fetch' }),
      ]),
    });
    expect(body.system).toEqual(system);
    expect((applyPiWebTools(prepared, 'qwen-anthropic', routes) as typeof body).system).toEqual(
      prepared.system,
    );
    expect(applyPiWebTools(body, 'qwen-anthropic', { search: 'none', fetch: 'server' })).toBe(body);
    expect(applyPiWebTools(body, 'qwen-anthropic', { search: 'client', fetch: 'client' })).toBe(
      body,
    );
    expect((applyPiWebTools(body, 'anthropic', routes) as typeof body).system).toBe(system);
  });

  test.each([
    ['qwen3.8-flash', undefined],
    ['qwen3.8-max', undefined],
    ['qwen3.8-omni-flash', 'agent'],
    ['qwen3.7-plus', 'agent'],
  ])('uses QwenCloud search strategy for %s', (model, strategy) => {
    expect(applyPiWebTools({ model }, 'qwencloud', { search: 'server', fetch: 'client' })).toEqual({
      model,
      enable_search: true,
      search_options: { ...(strategy ? { search_strategy: strategy } : {}) },
    });
  });
});
