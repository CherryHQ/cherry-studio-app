import type { PluginGuideSnapshot } from '@/backend/services/builtInMcp';
import { resolveBuiltInPluginGuides } from '@/backend/services/builtInMcp';

import type { RuntimeTool } from '../../runtime';
import { createLoadWorkflowTool, getAvailableWorkflows } from '../workflowTool';

const guides: PluginGuideSnapshot[] = [
  {
    pluginId: 'github',
    serverId: 'github-connection',
    revision: 2,
    content: 'Inspect the PR head before merging.',
  },
  {
    pluginId: 'feishu',
    serverId: 'feishu-connection',
    revision: 4,
    content: 'Resolve the wiki resource before reading its table.',
  },
];

function tool(capabilityId: string, approval: RuntimeTool['approval'] = 'auto'): RuntimeTool {
  return {
    ref: { source: 'builtin', capabilityId },
    providerName: `mobile_${capabilityId}`,
    displayName: capabilityId,
    description: '',
    inputSchema: {},
    approval,
    execute: async () => ({ value: null, artifacts: [] }),
  };
}

function call(workflow_id: string, signal = new AbortController().signal) {
  return { input: { workflow_id }, signal, toolCallId: 'load', turnId: 'turn' };
}

test('loads one attributed plugin guide into trusted instructions without duplicating the body in results', async () => {
  const loader = createLoadWorkflowTool(getAvailableWorkflows([], guides));
  const result = await loader.execute(call('plugin:github-connection'));
  expect(result.instructions).toMatchObject({ key: 'workflow:plugin:github-connection' });
  expect(result.instructions?.text).toContain('revision 2; connection github-connection');
  expect(result.instructions?.text).toContain(guides[0]!.content);
  expect(result.instructions?.text).not.toContain(guides[1]!.content);
  expect(result.value).toEqual({
    status: 'ok',
    workflow_id: 'plugin:github-connection',
    instructionsInSystem: true,
  });
  expect(JSON.stringify(result.value)).not.toContain(guides[0]!.content);
  expect(result.artifacts).toEqual([]);
});

test('retains complete templates and current tool aliases only for workflows with all prerequisites', async () => {
  const workflows = getAvailableWorkflows([tool('web_search'), tool('web_fetch')], []);
  const loader = createLoadWorkflowTool(workflows);
  const result = await loader.execute(call('system:research-brief'));
  expect(result.instructions?.text).toContain('`mobile_web_search`');
  expect(result.instructions?.text).toContain('`mobile_web_fetch`');
  expect(result.instructions?.text).toContain('#### references/structure.md');
  expect(result.instructions?.text).toContain('at most five bullets');
  expect(workflows.map(({ id }) => id)).not.toContain('system:daily-agenda');
  const denied = createLoadWorkflowTool(
    getAvailableWorkflows([tool('web_search'), tool('web_fetch', 'deny')], []),
  );
  const missing = await denied.execute(call('system:research-brief'));
  expect(missing.value).toMatchObject({ status: 'error' });
  expect(missing.instructions).toBeUndefined();
});

test('cannot load a disconnected plugin or instructions outside the frozen catalog', async () => {
  const loader = createLoadWorkflowTool(getAvailableWorkflows([], guides.slice(1)));
  const result = await loader.execute(call('plugin:github-connection'));
  expect(result.value).toMatchObject({ status: 'error' });
  expect(result.instructions).toBeUndefined();
  const controller = new AbortController();
  controller.abort();
  await expect(
    loader.execute(call('system:structured-notes', controller.signal)),
  ).rejects.toThrow();
});

test.each([
  ['amap', 'maps_around_search'],
  ['github', 'get_me'],
  ['feishu', 'wiki_get_node'],
  ['dingtalk', 'get_document_content'],
  ['notion', 'notion-fetch'],
  ['wecom', 'wecom_identity__whoami'],
])(
  'keeps %s capability routing and critical constraints visible while retaining the complete guide for loading',
  async (pluginId, rawToolName) => {
    const snapshots = resolveBuiltInPluginGuides([
      { pluginId, serverId: `${pluginId}-connection`, rawToolName },
    ]);
    expect(snapshots).toHaveLength(1);
    const guide = snapshots[0]!;
    expect(guide.overview).toBeTruthy();
    const workflows = getAvailableWorkflows([], snapshots);
    const workflow = workflows.find(({ id }) => id === `plugin:${pluginId}-connection`)!;
    expect(workflow.description).toContain(guide.overview!.replace(/\s+/g, ' ').trim());
    const result = await createLoadWorkflowTool(workflows).execute(call(workflow.id));
    expect(result.instructions?.text).toContain(guide.content);
  },
);
