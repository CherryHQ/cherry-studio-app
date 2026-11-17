# Data settings

The route groups backup, conversation import and local storage maintenance.

The `data/deepseek` child page accepts a DeepSeek export download link above a three-step illustrated
export guide. The backend validates and downloads the archive, creates a new `DeepSeek` Agent and
imports all conversations into it without a destination or model picker. The page owns its transient
input and progress; leaving it cancels pending work. The signed link is never persisted. Existing
data remains in place. See [DeepSeek import](../../../../backend/services/deepseekImport/README.md).

Backup exposes local full export and replacement restore through `Backend.backup`. This page only
starts an export and selects an archive to restore; the app-wide `BackupDialog` in
`appShell/backup` shows progress, the finished export with Save to Files and Share, and the restore
preview that doubles as the destructive confirmation.
The backend owns validation, operation lifetime and storage transitions. The app bootstrap gate
owns the global restart surface after durable staging.

Storage shows the size of the Agent's disposable execution file and clears it through
`Backend.agent.clearWorkingStorage()` after a confirmation. Chats and files are unaffected; the
Host rejects the request while work runs. See
[Clearing The Working File](../../../../../docs/references/agent/pi-durable-migration.md#clearing-the-working-file).
