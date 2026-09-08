# Git Workflow

This guide defines commit, stacked-review, pull request, and case-only rename procedures.

## Commits

Write small, focused Conventional Commits:

```text
<type>(<specific-kebab-case-scope>): <description>
```

Use a module scope such as `data-api`, `chat-input`, `testing`, or `window-manager`. Generic scopes
such as `main` are not valid. Older unscoped commits are not precedents.

## Stacked Pull Requests

PR layering is the user's decision. Default to a single branch and PR for one coherent task. Use
the project [gh-stack skill](../../.agents/skills/gh-stack/SKILL.md) and create layers only when the
user explicitly requests a stack or layered PRs. Task size, dependent concerns, and reusable
component work do not imply that request.

Once the user opts in, plan the layers before implementation, put foundations at the bottom, and
keep Conventional Commit messages in every layer. Use one stack for one coherent story. Put
unrelated features, bug fixes, or refactors in separate Conductor workspaces; the user chooses their
PR structure independently. A linear stack is not a container for parallel independent work.

Within a user-requested stack, when a feature needs a new reusable CherryUI component, place the
component package change in its own bottom PR and the feature integration in the PR above it.
Otherwise, keep both changes in the same PR. See [UI Development](./ui-development.md).

## Pull Request Lifecycle

1. Run the local gates in [Testing And CI](./testing-and-ci.md).
2. Create a normal PR as a draft. For a user-requested stack, submit all layers with
   `gh stack submit --auto`.
3. After successful PR or stack creation, release the workspace's simulators or emulators and
   allocated port range using [Parallel Device Testing](./parallel-device-testing.md).
4. Rerun local gates after later draft changes, then mark the final head ready for review.
5. Treat remote CI as the PR-suite gate, with local-only exceptions in [Testing And CI](./testing-and-ci.md).

For a stack, release resources once after all layers have been submitted, not after each layer.

## Case-Only Renames

Git on macOS may ignore a rename that changes only letter case. Use an intermediate name:

```bash
git mv Foo.tsx _tmp_foo.tsx
git mv _tmp_foo.tsx foo.tsx
```
