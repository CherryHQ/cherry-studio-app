# Team Agent Runtime

This app-owned workflow is exposed as `Backend.teamAgent`. Its public barrel exports
`TeamAgentRuntime` and the backend-only adapter interfaces for bootstrap composition. It has no
enterprise imports, persistence, local Agent execution or desktop connection demand.

Connections are immutable authenticated contexts. The runtime owns memory drafts and session
observers; adapters own wire formats, capabilities and uncertain-submission recovery. Releasing
an observer never cancels server execution. Context replacement retires every old handle.

See [Team Agent](../../../../docs/references/team-agent.md) for the feature map, data lifetime and
enterprise/community boundary. Regression cases are colocated in `__tests__`.
