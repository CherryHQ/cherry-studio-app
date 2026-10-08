import type { PluginGuideDefinition } from '../../pluginGuide';

export const githubGuide = {
  revision: 3,
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
      requiredTools: ['search_code', 'get_file_contents'],
      content: `## Find code

Scope \`github search_code\` to the intended repository. Search results locate candidates; use
\`get_file_contents\` at the requested branch or commit to inspect the actual code.`,
    },
    {
      requiredTools: ['list_branches', 'list_commits', 'get_commit'],
      content: `## Branches and history

Use \`list_branches\` and \`list_commits\` to locate the requested revision, then \`github get_commit\`
for its changes. Continue pagination when needed. Prefer stats before requesting a large full patch.`,
    },
    {
      requiredTools: ['actions_list', 'actions_get', 'get_job_logs'],
      content: `## Inspect workflow failures

Use \`actions_list\` to locate the run and jobs, \`actions_get\` for their details, and
\`github get_job_logs\` for the failing job. A workflow run ID and a job ID are different resources.
These tools inspect runs; they do not trigger or rerun workflows.`,
    },
    {
      requiredTools: ['list_releases', 'get_release_by_tag'],
      content: `## Releases

Use \`list_releases\` or \`github get_release_by_tag\` to read published release metadata.
The latest release is not necessarily the highest version or the latest prerelease.`,
    },
    {
      requiredTools: [
        'pull_request_read',
        'pull_request_review_write',
        'add_comment_to_pending_review',
      ],
      content: `## Publish a review

Read the current diff and head commit with \`pull_request_read\`. Use \`pull_request_review_write\`
to create a pending review, \`add_comment_to_pending_review\` for comments anchored to actual diff
lines, and the submit operation to publish when requested. A pending review is not yet published.`,
    },
    {
      requiredTools: ['pull_request_read', 'update_pull_request'],
      content: `## Update a pull request

Read \`pull_request_read\`, then use \`github update_pull_request\` for the requested metadata,
state or reviewers. Changing the base branch can change the diff; inspect it again afterwards.`,
    },
    {
      requiredTools: ['pull_request_read', 'merge_pull_request', 'update_pull_request_branch'],
      content: `## Update a branch or merge

Read the current PR head and checks with \`pull_request_read\`. Use \`update_pull_request_branch\`
only when a base-to-head update is requested, and \`merge_pull_request\` only when merging is requested.
Pass expectedHeadSha from the inspected head to protect against concurrent changes. Branch updates
modify the remote repository; merges may close the PR and trigger automation.`,
    },
    {
      requiredTools: ['list_branches', 'create_branch'],
      content: `## Create a remote branch

Inspect \`list_branches\`, then use \`github create_branch\` with an explicit source branch when a new
remote branch is requested. Branch creation alone does not add the requested code changes.`,
    },
    {
      requiredTools: ['create_pull_request'],
      content: `## Create a pull request

Use \`github create_pull_request\` with an existing head branch, the intended base and prepared changes.
This connection cannot edit local code or upload file changes; prepared changes are a prerequisite.`,
    },
  ],
} satisfies PluginGuideDefinition;
