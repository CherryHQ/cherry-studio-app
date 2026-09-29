# Backup settings

The route exposes local full export and replacement restore through `Backend.backup`. UI ownership
is limited to system file selection/sharing, progress, a preview and destructive confirmation.
The backend owns validation, operation lifetime and storage transitions. The app bootstrap gate
owns the global restart surface after durable staging.
