# Temporary File Preview

`openTemporaryFilePreview` sends a caller-owned cache file to the existing file viewer without
creating a file entry or library record. Navigation carries only an opaque request id and display
source id; cache URIs and release callbacks remain in memory. An unavailable request never resolves
an arbitrary URI or falls back to a managed file.

The request expires after 30 seconds if navigation never mounts a viewer. Mounted viewers retain
the cache lease; the last reader releases it on unmount. Deferred disposal allows a strict-effect
remount to reclaim it. Failed navigation releases immediately. Process death leaves only disposable
OS cache bytes, never persisted file authority.

The files feature reuses its image, text, HTML and document viewers. Temporary sources cannot be
edited, attached to a chat, shared through managed-file conversion, or used for Office references.
Explicit system opening first copies bytes through `fileExport.prepareSharedFile`, so an external
reader can outlive the preview's cache lease.
