import type { PluginGuideDefinition } from '../../pluginGuide';

export const githubGuide = {
  revision: 2,
  sections: [
    {
      requiredTools: [],
      content: `# GitHub

For GitHub repository, Issue and Pull Request tasks, derive owner, repository and item number from the
supplied URL. Honor the requested branch or commit. Search results identify candidates, not conclusions.`,
    },
    {
      requiredTools: ['get_me'],
      content: `## Account context

Use \`github get_me\` for identity-dependent requests such as “my issues”; the repository owner may be
someone else.`,
    },
    {
      requiredTools: ['issue_read'],
      content: `## Read an issue

Use \`github issue_read\` to read the body and relevant discussion before judging a duplicate or
preparing a substantive reply; a matching title is insufficient.`,
    },
    {
      requiredTools: ['pull_request_read'],
      content: `## Inspect a pull request

Use \`github pull_request_read\` for the actual changes and relevant comments or checks. Ground review
findings in the diff and files, distinguishing observed defects from hypotheses.`,
    },
    {
      requiredTools: ['issue_read', 'issue_write'],
      content: `## Update an issue

Read \`issue_read\`, then use the update operation of \`github issue_write\` for the same issue.`,
    },
    {
      requiredTools: ['issue_read', 'add_issue_comment'],
      content: `## Reply to an issue

Read the relevant discussion with \`issue_read\`, then use \`github add_issue_comment\` when publication
is requested.`,
    },
    {
      requiredTools: ['create_pull_request'],
      content: `## Create a pull request

Use \`github create_pull_request\` with an existing head branch, the intended base and prepared changes.
This connection cannot edit local code, commit or push; missing changes or branches are prerequisites.`,
    },
  ],
} satisfies PluginGuideDefinition;
