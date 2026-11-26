import { linkAbortSignals } from '@/backend/utils/linkAbortSignals';
import { PluginError } from '@/shared/contracts/plugins';

import type { PluginClient, PluginClientContext } from '../../pluginDefinition';
import { createOfficialMcpClient } from '../../transport/createOfficialMcpClient';
import { callGithubPagesTool, getGithubPagesTools, isGithubPagesTool } from './githubPagesApi';

/** Hosted MCP catalog; the GitHub Pages tools are local and never fetched from the endpoint. */
const REMOTE_TOOL_POLICY: Readonly<Record<string, 'read' | 'write'>> = {
  get_me: 'read',
  search_repositories: 'read',
  search_code: 'read',
  search_issues: 'read',
  search_pull_requests: 'read',
  get_file_contents: 'read',
  list_branches: 'read',
  list_commits: 'read',
  get_commit: 'read',
  list_tags: 'read',
  get_tag: 'read',
  list_releases: 'read',
  get_latest_release: 'read',
  get_release_by_tag: 'read',
  actions_list: 'read',
  actions_get: 'read',
  get_job_logs: 'read',
  list_pull_requests: 'read',
  issue_read: 'read',
  pull_request_read: 'read',
  issue_write: 'write',
  add_issue_comment: 'write',
  create_pull_request: 'write',
  create_branch: 'write',
  update_pull_request: 'write',
  update_pull_request_branch: 'write',
  merge_pull_request: 'write',
  pull_request_review_write: 'write',
  add_comment_to_pending_review: 'write',
};

/**
 * One grant-aware catalog combining the hosted GitHub MCP endpoint with local GitHub Pages
 * REST tools. The Pages tools never leave the device except for their direct GitHub API calls,
 * so they bypass the hosted transport entirely.
 */
export async function createGithubClient(context: PluginClientContext): Promise<PluginClient> {
  context.signal.throwIfAborted();
  const lifetime = new AbortController();
  let remote: PluginClient | undefined;
  let connecting: Promise<PluginClient> | undefined;
  let closing: Promise<void> | undefined;

  function operationSignal(caller?: AbortSignal) {
    if (lifetime.signal.aborted) throw new PluginError('cancelled', 'GitHub client closed.');
    // The initialization deadline is not the lifetime of later calls.
    return linkAbortSignals(caller ? [lifetime.signal, caller] : [lifetime.signal]);
  }

  function getRemote(signal: AbortSignal): Promise<PluginClient> {
    if (remote) return Promise.resolve(remote);
    connecting ??= createOfficialMcpClient(
      { ...context, tools: REMOTE_TOOL_POLICY, signal: lifetime.signal },
      { url: 'https://api.githubcopilot.com/mcp/' },
    )
      .then(async (client) => {
        if (signal.aborted || lifetime.signal.aborted) {
          await client.close();
          throw new PluginError('cancelled', 'GitHub connection cancelled.');
        }
        remote = client;
        return client;
      })
      .finally(() => {
        connecting = undefined;
      });
    return connecting;
  }

  return {
    get serverInfo() {
      return remote?.serverInfo ?? { name: 'Cherry Studio GitHub', version: '1' };
    },
    get discoveryWarnings() {
      return remote?.discoveryWarnings ?? [];
    },
    async listTools(input) {
      const linked = operationSignal(input?.options?.signal);
      const { signal } = linked;
      try {
        signal.throwIfAborted();
        const localTools = getGithubPagesTools().filter((tool) =>
          Object.hasOwn(context.tools, tool.name),
        );
        if (!Object.keys(REMOTE_TOOL_POLICY).some((name) => Object.hasOwn(context.tools, name)))
          return { tools: localTools };
        const client = await getRemote(signal);
        const page = await client.listTools({ options: { signal } });
        const hosted = page.tools.filter(
          (tool) =>
            Object.hasOwn(context.tools, tool.name) && Object.hasOwn(REMOTE_TOOL_POLICY, tool.name),
        );
        return { tools: [...hosted, ...localTools] };
      } finally {
        linked.dispose();
      }
    },
    async callTool(input) {
      const linked = operationSignal(input.options?.abortSignal);
      const { signal } = linked;
      try {
        signal.throwIfAborted();
        if (!Object.hasOwn(context.tools, input.name))
          throw new PluginError('access', 'The GitHub tool is not admitted.');
        if (isGithubPagesTool(input.name))
          return await callGithubPagesTool(context, input.name, input.args, signal);
        if (Object.hasOwn(REMOTE_TOOL_POLICY, input.name)) {
          const client = await getRemote(signal);
          return await client.callTool({ ...input, options: { abortSignal: signal } });
        }
        throw new PluginError('access', 'The GitHub tool is not admitted.');
      } finally {
        linked.dispose();
      }
    },
    close() {
      if (!closing) {
        lifetime.abort();
        closing = (async () => {
          await connecting?.catch(() => undefined);
          await remote?.close();
          remote = undefined;
        })();
      }
      return closing;
    },
  };
}
