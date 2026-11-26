import type { CallToolResult, ListToolsResult } from '@modelcontextprotocol/client';
import * as z from 'zod';

import { createHttpClient, isHttpError } from '@/backend/services/http';
import { PluginError, type PluginErrorReason } from '@/shared/contracts/plugins';

import type { PluginClientContext } from '../../pluginDefinition';
import { GithubTokenCredentialSchema, GithubUserCredentialSchema } from './githubCredentials';

const api = createHttpClient({ baseUrl: 'https://api.github.com', timeoutMs: 15_000 });
const API_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2026-03-10',
};
const MAX_RESPONSE_BYTES = 256 * 1024;

type GithubPagesToolName =
  | 'pages_create_repository'
  | 'pages_upload_file'
  | 'pages_enable'
  | 'pages_status';

const PAGES_TOOL_NAMES: readonly GithubPagesToolName[] = [
  'pages_create_repository',
  'pages_upload_file',
  'pages_enable',
  'pages_status',
];

function isPagesTool(name: string): name is GithubPagesToolName {
  return (PAGES_TOOL_NAMES as readonly string[]).includes(name);
}

const CreateRepositoryInput = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9._-]+$/),
  description: z.string().max(350).optional(),
  private: z.boolean().optional().default(false),
});
const UploadFileInput = z.object({
  owner: z.string().min(1).max(100),
  repo: z.string().min(1).max(100),
  path: z.string().min(1).max(256),
  content: z.string().min(1),
  message: z.string().max(512).optional(),
});
const EnablePagesInput = z.object({
  owner: z.string().min(1).max(100),
  repo: z.string().min(1).max(100),
  branch: z.string().min(1).max(100).optional().default('main'),
});
const PagesStatusInput = z.object({
  owner: z.string().min(1).max(100),
  repo: z.string().min(1).max(100),
});

type Repository = {
  name: string;
  owner: { login: string };
  html_url: string;
  default_branch?: string;
};
type ContentWrite = {
  content?: { sha: string };
  commit?: { sha: string };
};
type Pages = {
  html_url?: string;
  status?: string;
  build_type?: string;
};

function textResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] };
}

function apiError(error: unknown, isWrite: boolean): PluginError {
  if (isHttpError(error)) {
    const status = error.status;
    let reason: PluginErrorReason = 'request';
    if (status === 401) reason = 'authorization';
    else if (status === 403 || status === 404) reason = 'access';
    else if (status === 429) reason = 'quota';
    else if (isWrite && (status === 408 || (status !== undefined && status >= 500)))
      reason = 'unknown-write';
    return new PluginError(
      reason,
      reason === 'unknown-write'
        ? `GitHub write outcome is unknown (status ${status ?? 'none'}). Check the repository before retrying.`
        : `GitHub rejected the request (status ${status ?? 'none'}).`,
      { statusCode: status },
    );
  }
  return new PluginError('network', 'Could not reach GitHub.');
}

async function resolveToken(context: PluginClientContext, signal?: AbortSignal): Promise<string> {
  const credential = await context.getCredential(signal).catch((error: unknown) => {
    if (error instanceof PluginError) throw error;
    throw new PluginError('authorization', 'GitHub authorization is no longer available.');
  });
  const user = GithubUserCredentialSchema.safeParse(credential);
  if (user.success && !user.data.rejected) return user.data.tokens.accessToken;
  const token = GithubTokenCredentialSchema.safeParse(credential);
  if (token.success) return token.data.token;
  throw new PluginError('authorization', 'Reconnect GitHub to authorize publishing.');
}

export async function callGithubPagesTool(
  context: PluginClientContext,
  name: GithubPagesToolName,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<CallToolResult> {
  const token = await resolveToken(context, signal);
  signal?.throwIfAborted();
  const headers = { ...API_HEADERS, Authorization: `Bearer ${token}` };
  const isWrite = name !== 'pages_status';

  try {
    switch (name) {
      case 'pages_create_repository': {
        const input = CreateRepositoryInput.parse(args);
        const body = {
          name: input.name,
          description: input.description,
          private: input.private,
          auto_init: false,
        };
        const { data } = await api.request<Repository, typeof body>({
          method: 'POST',
          path: '/user/repos',
          body,
          headers,
          signal,
          maxResponseBytes: MAX_RESPONSE_BYTES,
        });
        return textResult(
          JSON.stringify({ name: data.name, owner: data.owner.login, url: data.html_url }),
        );
      }
      case 'pages_upload_file': {
        const input = UploadFileInput.parse(args);
        const body = {
          message: input.message ?? `Add ${input.path}`,
          content: input.content,
        };
        const { data } = await api.request<ContentWrite, typeof body>({
          method: 'PUT',
          path: `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/contents/${input.path
            .split('/')
            .map(encodeURIComponent)
            .join('/')}`,
          body,
          headers,
          signal,
          maxResponseBytes: MAX_RESPONSE_BYTES,
        });
        return textResult(JSON.stringify({ commit: data.commit?.sha ?? null }));
      }
      case 'pages_enable': {
        const input = EnablePagesInput.parse(args);
        // build_type 'legacy' selects a branch source and needs only the `repo` scope already
        // requested by the GitHub OAuth app; 'workflow' would require the `workflow` scope.
        const body = {
          build_type: 'legacy' as const,
          source: { branch: input.branch, path: '/' },
        };
        const { data } = await api.request<Pages, typeof body>({
          method: 'POST',
          path: `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/pages`,
          body,
          headers,
          signal,
          maxResponseBytes: MAX_RESPONSE_BYTES,
        });
        return textResult(
          JSON.stringify({ url: data.html_url ?? null, status: data.status ?? 'building' }),
        );
      }
      case 'pages_status': {
        const input = PagesStatusInput.parse(args);
        const { data } = await api.request<Pages>({
          method: 'GET',
          path: `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/pages`,
          headers,
          signal,
          maxResponseBytes: MAX_RESPONSE_BYTES,
        });
        return textResult(
          JSON.stringify({ url: data.html_url ?? null, status: data.status ?? 'unknown' }),
        );
      }
    }
  } catch (error) {
    if (signal?.aborted)
      throw new PluginError('cancelled', 'The GitHub Pages request was cancelled.');
    if (error instanceof PluginError) throw error;
    if (error instanceof z.ZodError)
      throw new PluginError('request', `Invalid arguments for GitHub tool ${name}.`);
    throw apiError(error, isWrite);
  }
}

const TOOL_DEFINITIONS: ListToolsResult['tools'] = [
  {
    name: 'pages_create_repository',
    description:
      'Create a new GitHub repository under the authenticated user. Returns the repository name, owner and URL.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Repository name (letters, digits, . _ -).' },
        description: { type: 'string', description: 'Optional short description.' },
        private: { type: 'boolean', description: 'Whether the repository is private.' },
      },
      required: ['name'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'pages_upload_file',
    description:
      'Create or update a file in a GitHub repository via the contents API. Provide the full file content as a string.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner login.' },
        repo: { type: 'string', description: 'Repository name.' },
        path: { type: 'string', description: 'File path inside the repository, e.g. index.html.' },
        content: { type: 'string', description: 'Full file content.' },
        message: { type: 'string', description: 'Optional commit message.' },
      },
      required: ['owner', 'repo', 'path', 'content'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'pages_enable',
    description:
      'Enable GitHub Pages for a repository using a branch source (legacy build). Requires the repo to already contain the site files.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner login.' },
        repo: { type: 'string', description: 'Repository name.' },
        branch: { type: 'string', description: 'Branch to serve from. Defaults to main.' },
      },
      required: ['owner', 'repo'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'pages_status',
    description: 'Get the GitHub Pages status and URL for a repository.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner login.' },
        repo: { type: 'string', description: 'Repository name.' },
      },
      required: ['owner', 'repo'],
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
];

export const GITHUB_PAGES_TOOL_NAMES = PAGES_TOOL_NAMES;
export function isGithubPagesTool(name: string): name is GithubPagesToolName {
  return isPagesTool(name);
}
export function getGithubPagesTools(): ListToolsResult['tools'] {
  return TOOL_DEFINITIONS;
}
