import type { PluginGuideDefinition } from '../../pluginGuide';

export const githubGuide = {
  revision: 1,
  sections: [
    {
      requiredTools: [],
      content: `# GitHub

Use this connection for GitHub repository, Issue and Pull Request tasks supported by the available tools.
Derive the repository owner, repository name and item number from a supplied GitHub URL. Resolve ambiguity
before acting on another repository. Search results are candidates; report pagination or truncation honestly.
Return the service's actual URL and distinguish a draft in chat from a published change.`,
    },
    {
      requiredTools: ['get_me'],
      content: `## Account context

Discover \`github get_me\` when a task depends on the connected identity, such as interpreting “my issues”.
Do not infer the account from a repository owner or an earlier connection.`,
    },
    {
      requiredTools: ['search_repositories'],
      content: `## Find a repository

Discover \`github search_repositories\` for an ambiguous project name. Narrow by owner or organization when
known, and use the returned full repository name for later operations.`,
    },
    {
      requiredTools: ['search_issues'],
      content: `## Find issues

Discover \`github search_issues\`, scoping the query to the known repository and requested state or topic.
For a proposed new issue, search for duplicates when this helps the task. Read the relevant issue before
concluding that a title match is a duplicate.`,
    },
    {
      requiredTools: ['issue_read'],
      content: `## Read an issue

Discover \`github issue_read\` and inspect its current operation options. Read the body, state and relevant
comments needed for the task; do not base an update or a substantive reply on the title alone.`,
    },
    {
      requiredTools: ['get_file_contents'],
      content: `## Read repository files

Discover \`github get_file_contents\`. Use the requested path and branch or commit when supplied; do not
silently substitute another revision. Read only files needed to understand the issue or proposed change.`,
    },
    {
      requiredTools: ['search_pull_requests'],
      content: `## Find pull requests

Discover \`github search_pull_requests\` for a topic or author, with repository and state filters where known.
A result summary does not establish the contents or review status of the change.`,
    },
    {
      requiredTools: ['list_pull_requests'],
      content: `## Browse pull requests

Discover \`github list_pull_requests\` for a repository listing. Respect the requested state and ordering,
and follow pagination only as far as the requested scope requires.`,
    },
    {
      requiredTools: ['pull_request_read'],
      content: `## Inspect a pull request

Discover \`github pull_request_read\`. Use its current operation options to obtain the relevant description,
diff, files, comments or checks. Separate observed problems from hypotheses and include the actual PR URL.`,
    },
    {
      requiredTools: ['issue_write'],
      content: `## Create an issue

Discover \`github issue_write\` and inspect its current creation arguments. Use the established repository
and a concrete title and body. Check for duplicates with an available issue reader when useful, and
report success only from a successful result.`,
    },
    {
      requiredTools: ['issue_read', 'issue_write'],
      content: `## Update an issue

Read the current issue with \`issue_read\`, then inspect the update arguments of \`github issue_write\`.
Preserve fields the user did not ask to change and distinguish an update from creating another issue.`,
    },
    {
      requiredTools: ['issue_read', 'add_issue_comment'],
      content: `## Reply to an issue

Read the relevant issue and discussion with \`issue_read\`, then discover \`github add_issue_comment\`.
Keep a requested draft in chat; publish when the user requests publication. If a write has an uncertain
outcome, inspect the issue comments before attempting it again to avoid duplicate replies.`,
    },
    {
      requiredTools: ['create_pull_request'],
      content: `## Create a pull request

Discover \`github create_pull_request\`. Establish the repository, existing head branch, base branch and
intended changes. This connection does not edit local code, create commits or push branches. If the
required branch or changes do not exist, explain that prerequisite instead of claiming to prepare them.
After an uncertain write, inspect the service before retrying; never blindly repeat a creation request.`,
    },
  ],
} satisfies PluginGuideDefinition;
