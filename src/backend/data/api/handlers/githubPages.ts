import type { McpServerService } from '@/backend/data/services/McpServerService';
import { PluginError } from '@/shared/contracts/plugins';
import { toDataApiError } from '@/shared/data/api/errors';
import {
  PublishGithubPagesSchema,
  type GithubPagesSchemas,
  type PublishGithubPagesResult,
} from '@/shared/data/api/schemas/githubPages';
import type { HandlersFor } from '@/shared/data/api/types';

export type GithubPagesRuntime = {
  callPluginTool(
    serverId: string,
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown>;
};

/**
 * Product-facing publish endpoint. Finds the connected GitHub plugin, then drives its
 * pages_create_repository → pages_upload_file → pages_enable → pages_status tools in order.
 * Each write still goes through the runtime's catalog + approval policy.
 */
export function createGithubPagesHandlers(
  runtime: GithubPagesRuntime,
  servers: Pick<McpServerService, 'list'>,
): HandlersFor<GithubPagesSchemas> {
  return {
    '/github-pages/publish': {
      POST: async ({ body }) => {
        const parsed = PublishGithubPagesSchema.safeParse(body);
        if (!parsed.success) throw toDataApiError(parsed.error, 'GitHub Pages publish');
        const { repoName, html, description, private: isPrivate } = parsed.data;

        const { items } = await servers.list({ isEnabled: true });
        const github = items.find(
          (server) => server.origin === 'builtin' && server.builtinId === 'github',
        );
        if (!github)
          throw new PluginError(
            'authorization',
            'Connect the GitHub plugin before publishing a site.',
          );

        const signal = new AbortController().signal;
        try {
          const created = (await runtime.callPluginTool(
            github.id,
            'pages_create_repository',
            { name: repoName, description, private: isPrivate },
            signal,
          )) as { owner?: string; name?: string; url?: string };
          const owner = created.owner;
          const repo = created.name;
          if (!owner || !repo)
            throw new PluginError('request', 'GitHub did not return the repository identity.');

          await runtime.callPluginTool(
            github.id,
            'pages_upload_file',
            { owner, repo, path: 'index.html', content: html, message: 'Publish site' },
            signal,
          );

          const enabled = (await runtime.callPluginTool(
            github.id,
            'pages_enable',
            { owner, repo, branch: 'main' },
            signal,
          )) as { url?: string | null; status?: string };

          // Pages builds asynchronously; one status read is enough to surface the URL early.
          let url = enabled.url ?? null;
          let status = enabled.status ?? 'building';
          try {
            const polled = (await runtime.callPluginTool(
              github.id,
              'pages_status',
              { owner, repo },
              signal,
            )) as { url?: string | null; status?: string };
            url = polled.url ?? url;
            status = polled.status ?? status;
          } catch {
            // A status failure must not discard an already-created site.
          }

          const result: PublishGithubPagesResult = { owner, repo, url, status };
          return result;
        } catch (error) {
          if (error instanceof PluginError) throw error;
          throw new PluginError('request', 'GitHub Pages publish failed.');
        }
      },
    },
  };
}
