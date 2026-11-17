# AgentPicker

`AgentPickerSheet` is the shared Agent choice sheet for local chat, desktop chat and SSH handoff.
It retains the existing avatar/name/model rows, selected state, loading/error/empty presentation,
optional pagination and optional edit/create actions. Callers own the catalog and navigation.

The sheet closes before dispatching selection, editing or creation. Async handoff work must live
with the caller so unmounting the sheet does not cancel it. SSH supplies standard Agents only,
its existing title and its standard-Agent empty message. Header callers retain their existing
management actions and source catalogs.
