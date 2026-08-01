/**
 * Shape-only port of desktop src/shared/types/codeCli.ts (registered in
 * desktop-sync-manifest.json `shapeOnlyPorts`). The enum backs the seeded
 * `feature.code_cli.configs` preference value, so desktop backups round-trip.
 * Desktop-only capability halves (terminal launch configs, CLI gateway /
 * own-login virtual provider ids) are dropped: mobile cannot launch CLIs.
 */
export enum CodeCli {
  CLAUDE_CODE = 'claude-code',
  OPENAI_CODEX = 'openai-codex',
  OPEN_CODE = 'opencode',
  OPENCLAW = 'openclaw',
  GEMINI_CLI = 'gemini-cli',
  QWEN_CODE = 'qwen-code',
  KIMI_CODE = 'kimi-code',
  QODER_CLI = 'qoder-cli',
  GITHUB_COPILOT_CLI = 'github-copilot-cli',
}
