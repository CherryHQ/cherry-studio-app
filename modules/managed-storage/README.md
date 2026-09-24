# Managed Storage

This local Expo module returns the platform's persistent application-support root as a `file://`
URI. It exists because Expo's `Paths.document` resolves to the user-visible Documents directory on
iOS, while installed Skill packages are application resources that belong under
`Library/Application Support` ([Apple guidance](https://developer.apple.com/documentation/foundation/using-the-file-system-effectively)).
Android returns the app's internal `filesDir`.

The module resolves the root through `FileManager` / `Context` at call time; it never hardcodes a
container path. Directory and file operations stay with `expo-file-system`, which accepts the
returned URI. `src/backend/services/skill/skillStorage.ts` is the only consumer.

Native changes require a new development build. An older client reports the module as unavailable,
and Skill installation fails with `storage-unavailable` rather than falling back to Documents.
