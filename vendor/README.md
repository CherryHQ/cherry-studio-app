# Shared remote development artifacts

- `cherrystudio-remote-protocol-0.4.0-attachments.6.tgz`
- `cherrystudio-remote-transport-0.2.0-attachments.3.tgz`

These unpublished artifacts package the matching desktop packages, including binary
the single binary upload protocol. Mobile owns no duplicate wire schemas. The transport artifact has
a peer dependency on the exact protocol artifact version, resolved by this app.

Build desktop `packages/remote-protocol` then `packages/remote-transport`. Package each
built `dist/`, `fixtures/` if present, README and manifest under `package/`. Set the
prerelease versions above; omit development scripts/dependencies. In the transport
artifact only, replace the workspace protocol dependency with the matching peer
dependency. Refresh the mobile lockfile and install after replacing artifacts.

For release, use the authorized desktop Changesets workflow, replace both file
dependencies with matching published versions, and remove development artifacts.
The native crypto dependency requires rebuilding the development client APK.
