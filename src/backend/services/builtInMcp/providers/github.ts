import * as z from 'zod';

import { createHttpClient, isHttpError, type HttpRequest } from '@/backend/services/http';
import { PluginError } from '@/shared/contracts/plugins';

import { definePluginTool } from '../toolDefinition';

const repository = {
  owner: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[\w-]+$/),
  repo: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[\w.-]+$/)
    .refine((value) => value !== '.' && value !== '..'),
};
const pagination = {
  page: z.int().min(1).max(100).default(1),
  per_page: z.int().min(1).max(30).default(10),
};
const issue = { ...repository, issue_number: z.int().positive() };
const repositoryPath = ({ owner, repo }: { owner: string; repo: string }) =>
  `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
const accountSchema = z.object({ login: z.string(), id: z.number() });
const issueSchema = z.object({
  number: z.number(),
  title: z.string(),
  html_url: z.string(),
  state: z.string(),
  body: z.string().nullable().optional(),
  pull_request: z.object({ url: z.string() }).optional(),
});
const repositorySchema = z.object({
  full_name: z.string(),
  description: z.string().nullable(),
  html_url: z.string(),
  private: z.boolean(),
  default_branch: z.string(),
});
const pullRequestSchema = z.object({
  number: z.number(),
  title: z.string(),
  html_url: z.string(),
  state: z.string(),
  body: z.string().nullable(),
  head: z.object({ ref: z.string() }),
  base: z.object({ ref: z.string() }),
});

export function createGitHubClient(getCredential: () => Promise<string>) {
  const http = createHttpClient({
    baseUrl: 'https://api.github.com',
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' },
    interceptors: [
      {
        onRequest: async (request) => ({
          ...request,
          headers: { ...request.headers, Authorization: `Bearer ${await getCredential()}` },
        }),
      },
    ],
  });
  async function request<T>(input: HttpRequest, schema: z.ZodType<T>): Promise<T> {
    try {
      const response = await http.request<string>({
        ...input,
        responseType: 'text',
        maxResponseBytes: 512 * 1024,
      });
      return schema.parse(JSON.parse(response.data));
    } catch (error) {
      throw githubRequestError(error, input);
    }
  }
  return {
    getAccount: (signal?: AbortSignal) =>
      request({ method: 'GET', path: '/user', signal }, accountSchema),
    tools: [
      definePluginTool(
        'get_me',
        'Get the authenticated GitHub account.',
        z.strictObject({}),
        (_input, signal) => request({ method: 'GET', path: '/user', signal }, accountSchema),
      ),
      definePluginTool(
        'search_repositories',
        'Search GitHub repositories accessible to the connected account. Results are paginated.',
        z.strictObject({ query: z.string().min(1).max(256), ...pagination }),
        ({ query, ...page }, signal) =>
          request(
            { method: 'GET', path: '/search/repositories', query: { q: query, ...page }, signal },
            z.object({
              total_count: z.number(),
              incomplete_results: z.boolean(),
              items: z.array(repositorySchema),
            }),
          ),
      ),
      definePluginTool(
        'search_issues',
        'Search GitHub issues and pull requests with GitHub search syntax, such as repo:owner/repo is:issue.',
        z.strictObject({ query: z.string().min(1).max(256), ...pagination }),
        ({ query, ...page }, signal) =>
          request(
            { method: 'GET', path: '/search/issues', query: { q: query, ...page }, signal },
            z.object({
              total_count: z.number(),
              incomplete_results: z.boolean(),
              items: z.array(issueSchema),
            }),
          ),
      ),
      definePluginTool(
        'get_file_contents',
        'Read a UTF-8 text file or list a directory in a GitHub repository. Returns decoded text. Binary files and large files are not supported; open those on GitHub.',
        z.strictObject({
          ...repository,
          path: z
            .string()
            .max(1024)
            .default('')
            .refine((value) => !value.split('/').includes('..')),
          ref: z.string().max(256).optional(),
        }),
        ({ path, ref, ...repo }, signal) =>
          request(
            {
              method: 'GET',
              path: `${repositoryPath(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`,
              query: { ref },
              signal,
            },
            z.union([
              z
                .object({
                  type: z.literal('file'),
                  name: z.string(),
                  path: z.string(),
                  size: z.number(),
                  encoding: z.literal('base64'),
                  content: z.string(),
                  html_url: z.string().nullable(),
                })
                .transform((file) => ({
                  ...file,
                  encoding: 'utf-8',
                  content: new TextDecoder('utf-8', { fatal: true }).decode(
                    Uint8Array.from(atob(file.content.replace(/\s/g, '')), (char) =>
                      char.charCodeAt(0),
                    ),
                  ),
                })),
              z.array(
                z.object({
                  type: z.string(),
                  name: z.string(),
                  path: z.string(),
                  size: z.number(),
                  html_url: z.string().nullable(),
                }),
              ),
            ]),
          ),
      ),
      definePluginTool(
        'list_pull_requests',
        'List pull requests in a GitHub repository.',
        z.strictObject({
          ...repository,
          state: z.enum(['open', 'closed', 'all']).default('open'),
          ...pagination,
        }),
        ({ owner, repo, ...query }, signal) =>
          request(
            { method: 'GET', path: `${repositoryPath({ owner, repo })}/pulls`, query, signal },
            z.array(pullRequestSchema),
          ),
      ),
      definePluginTool(
        'get_issue',
        'Read an issue or pull request, including its description.',
        z.strictObject(issue),
        ({ issue_number, ...repo }, signal) =>
          request(
            { method: 'GET', path: `${repositoryPath(repo)}/issues/${issue_number}`, signal },
            issueSchema,
          ),
      ),
      definePluginTool(
        'create_issue',
        'Create an issue in a GitHub repository. This publishes content. Requires Issues write permission. Never retry automatically when the outcome is unknown.',
        z.strictObject({
          ...repository,
          title: z.string().min(1).max(256),
          body: z.string().max(20000).default(''),
        }),
        ({ owner, repo, ...body }, signal) =>
          request(
            { method: 'POST', path: `${repositoryPath({ owner, repo })}/issues`, body, signal },
            issueSchema,
          ),
        false,
      ),
      definePluginTool(
        'add_issue_comment',
        'Publish a comment on a GitHub issue or pull request. Requires Issues or Pull requests write permission. Never retry automatically when the outcome is unknown.',
        z.strictObject({ ...issue, body: z.string().min(1).max(20000) }),
        ({ issue_number, body, ...repo }, signal) =>
          request(
            {
              method: 'POST',
              path: `${repositoryPath(repo)}/issues/${issue_number}/comments`,
              body: { body },
              signal,
            },
            z.object({ id: z.number(), html_url: z.string(), body: z.string() }),
          ),
        false,
      ),
      definePluginTool(
        'create_pull_request',
        'Open a pull request between existing branches. This publishes content and requires Pull requests write permission. Never retry automatically when the outcome is unknown.',
        z.strictObject({
          ...repository,
          title: z.string().min(1).max(256),
          body: z.string().max(20000).default(''),
          head: z.string().min(1).max(256),
          base: z.string().min(1).max(256),
          draft: z.boolean().default(true),
        }),
        ({ owner, repo, ...body }, signal) =>
          request(
            { method: 'POST', path: `${repositoryPath({ owner, repo })}/pulls`, body, signal },
            pullRequestSchema,
          ),
        false,
      ),
    ],
  };
}

// Keep raw HTTP and validation errors out of tool results and native stacks.
function githubRequestError(error: unknown, input: HttpRequest): Error {
  if (input.signal?.aborted) return new PluginError('cancelled', 'GitHub request cancelled.');
  if (isHttpError(error)) {
    if (error.status === 401)
      return new PluginError(
        'authorization',
        'GitHub authorization expired or is invalid. Reconnect the plugin.',
      );
    if (error.status === 429)
      return new PluginError('quota', 'GitHub rate limit reached. Try again later.');
    if (error.status === 403)
      return new PluginError(
        'access',
        'GitHub denied this request. Check token permissions, organization approval, and rate limits.',
      );
    if (error.status === 404)
      return new PluginError(
        'access',
        'GitHub resource was not found or this token cannot access it.',
      );
  }
  if (
    input.method !== 'GET' &&
    (!isHttpError(error) ||
      error.status === undefined ||
      error.status < 400 ||
      error.status === 408 ||
      error.status >= 500)
  )
    return new PluginError(
      'unknown-write',
      'GitHub write outcome is unknown. Check GitHub before retrying.',
    );
  return new PluginError(
    isHttpError(error) && (error.kind === 'network' || error.kind === 'timeout')
      ? 'network'
      : 'request',
    'GitHub request failed or returned an unsupported response.',
  );
}
