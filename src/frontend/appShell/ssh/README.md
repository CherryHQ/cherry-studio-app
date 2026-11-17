# SSH Authentication

`SshAuthenticationDialog` is the app-wide presenter for the SSH runtime's bounded authentication
queue. It displays the verified destination and server questions, sends answers directly to the
runtime, and discards local answers after submission or dismissal. Answers never enter Agent
inputs, tool results, transcript storage, or logs. Cancellation and expiry belong to the runtime;
each challenge identity mounts a fresh form.
