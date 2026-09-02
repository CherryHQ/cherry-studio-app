# Settings UI

This shared frontend module owns route-neutral UI used by independent settings domains.

- `SettingsScrollPage` composes the common route header and scrolling content surface.
- `SettingsServiceRow` renders dense service rows used by provider and MCP management.
- `SettingOption` is the shared label/value shape for settings pickers.

Business state, navigation destinations, persistence, and translations remain in the consuming
feature.
