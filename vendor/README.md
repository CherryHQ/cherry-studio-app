# Shared protocol development artifact

`cherrystudio-remote-protocol-0.4.0-attachments.1.tgz` packages the built `dist/` and `fixtures/`
from Cherry Desktop `packages/remote-protocol` in the matching attachment change. It contains
no private mobile protocol definitions. The prerelease label identifies an unpublished artifact;
it has not been published to npm.

Build the desktop package with `pnpm --filter @cherrystudio/remote-protocol build`. Package its
`dist/`, `fixtures/`, README and package manifest (version `0.4.0-attachments.1`, omit development
scripts/dependencies) under the archive's `package/` directory. After replacing the archive,
refresh the mobile lockfile and install. Do not use a machine-specific path or a node_modules symlink.

For release, publish the desktop Changesets minor release through its normal authorized workflow,
then replace this file dependency with that npm version and remove the development artifact.
