# Policy

What the user may change, applied to standard components. The rules live in
`src/shared/data/managedPolicy.ts` and data services enforce them; this module only renders them.
Business screens declare which resource they show and use the wrapped components; they never
branch on editions or ownership.

## Public Interface

- `PolicyScope` declares the policy for everything below: the Agent of a chat or editor, one list
  row's resource, or a profile-owned settings page. Without a scope everything stays open.
- `withPolicy(Component, toProps)` maps the policy onto a component's ordinary props, or renders
  nothing. `withResourcePolicy(Component, policyOf)` gives a component its own resource's scope,
  such as one list row. `withCapability(capability, Component, Otherwise?)` renders a component
  only when the profile allows a capability.
- Gates: `PolicyEditable` (children, or a read-only `fallback` once its `field` is locked),
  `PolicySecret`, `PolicyDeletable` and `PolicyManaged` render their children only when allowed.
- `PolicySelectItem` is a `Section.SelectItem` that shows its value read-only once its `field` is
  locked. It marks itself `sectionItem`, so `Section` keeps it in its separators and press state.
- `ManagedBadge` marks an organization-owned resource and renders nothing elsewhere.
  `useManagedLabel` names the badge in a row's accessibility label.
- `useModelChoice` gives model pickers the allowed models and whether only one remains;
  `usePermittedItems` drops menu items whose `requires` the policy refuses.

## Rules

- `Section` styles only its own rows, so a wrapper inside one must always render a row. Hide whole
  sections, never single rows.
- Policies come from `agentPolicy`, `managedResourcePolicy` and `capabilityPolicy`; one record
  yields one policy object, so scopes stay stable across renders.
- Non-visual decisions, such as which list rows a selection may include, call those functions
  directly. Backup copy states what an enterprise backup holds and stays with the backup UI.
