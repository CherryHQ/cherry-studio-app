# System Entry

The app shell owns one foreground consumer for native shares. It starts only after the bootstrap
and router gates are ready, and releases outstanding claims when its host unmounts. The backend
owns admission, imports, deduplication, and native acknowledgement; this module owns navigation
and localized feedback. Route parameters carry memory-only handoff tokens, never shared text or
file paths. A share review owns dismissal once presented.
