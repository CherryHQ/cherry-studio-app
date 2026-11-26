import * as z from 'zod';

export const PublishGithubPagesSchema = z
  .object({
    repoName: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z0-9._-]+$/)
      .describe('Repository name to create under the authenticated GitHub user.'),
    html: z.string().min(1).describe('Full HTML document to publish as index.html.'),
    description: z.string().max(350).optional(),
    private: z.boolean().optional().default(false),
  })
  .strict();
export type PublishGithubPagesDto = z.infer<typeof PublishGithubPagesSchema>;

export type PublishGithubPagesResult = {
  owner: string;
  repo: string;
  url: string | null;
  status: string;
};

export type GithubPagesSchemas = {
  '/github-pages/publish': {
    POST: {
      body: PublishGithubPagesDto;
      response: PublishGithubPagesResult;
    };
  };
};
