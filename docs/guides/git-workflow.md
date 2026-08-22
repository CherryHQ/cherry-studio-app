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

Use the project `gh-stack` skill before implementation when one coherent story contains multiple
dependent concerns that can be reviewed in sequence. Plan the layers first, put foundations at the
bottom, and keep Conventional Commit messages in every layer.

Use one stack for one coherent story. Put unrelated features, bug fixes, or refactors in separate
Conductor workspaces and separate stacks. A linear stack is not a container for parallel independent
work.

When a feature needs a new reusable CherryUI component, place the component package change in its
own bottom PR and the feature integration in the PR above it. See
[UI Development](./ui-development.md).

## Pull Request Lifecycle

1. Run the local gates in [Testing And CI](./testing-and-ci.md).
2. Create a normal PR as a draft, or submit an entire stack with `gh stack submit --auto`.
3. After successful PR or stack creation, release the workspace's simulators or emulators and
   allocated port range using [Parallel Device Testing](./parallel-device-testing.md).
4. Rerun local gates after later draft changes, then mark the final head ready for review.
5. Treat the remote CI result as the complete-suite gate.

For a stack, release resources once after all layers have been submitted, not after each layer.

## Case-Only Renames

Git on macOS may ignore a rename that changes only letter case. Use an intermediate name:

```bash
git mv Foo.tsx _tmp_foo.tsx
git mv _tmp_foo.tsx foo.tsx
```
