import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { context } from './agentEnvironment/host';
import { build, fingerprint } from './agentEnvironment/native';
import { adopt, inventory, reconcile, release, start } from './agentEnvironment/pool';
import {
  PlatformSchema,
  readState,
  registerWorkspace,
  saveState,
  withLock,
} from './agentEnvironment/state';

const HELP = `Agent self-test environments (local macOS)

  status                              Read worktrees, devices and persistent resource records
  reconcile [--dry-run]               Release retired workspaces' resources and expire artifacts
  adopt --platform ios|android --device <stable-id>   Register the platform's test device
  fingerprint --platform ios|android  Compute native compatibility; never build
  build --platform ios|android [--source <checkout>]  Explicit local DEVELOPMENT build/cache
  start --platform ios|android [--session <task>] [--reset-data]  Lease, Metro, boot/install/open
  release [--session <task>]          Close task session, stop its Metro and release device
  archive                             Mark current workspace retired and release its resources

All output is JSON. No command downloads SDK images or creates devices. Only build compiles
native code. start requires task authorization for device actions and keeps app data unless
--reset-data reinstalls the development client. Session defaults to CONDUCTOR_SESSION_ID,
CODEX_THREAD_ID or CLAUDE_CODE_SESSION_ID. See the device testing guide.
`;

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    strict: true,
    options: {
      platform: { type: 'string' },
      device: { type: 'string' },
      source: { type: 'string' },
      session: { type: 'string' },
      'reset-data': { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help || !positionals.length) {
    console.log(HELP);
    return;
  }
  if (positionals.length !== 1) throw new Error('Expected one command.');
  const command = positionals[0];
  const commands = [
    'status',
    'reconcile',
    'adopt',
    'fingerprint',
    'build',
    'start',
    'release',
    'archive',
  ];
  if (!commands.includes(command)) throw new Error(`Unknown command: ${command}`);
  const ctx = context();
  const platform = () => PlatformSchema.parse(values.platform);
  const session = () => {
    const task =
      values.session ||
      process.env.CONDUCTOR_SESSION_ID ||
      process.env.CODEX_THREAD_ID ||
      process.env.CLAUDE_CODE_SESSION_ID;
    if (!task) throw new Error('Provide a stable --session identifier for this coding-agent task.');
    return `cherry-${createHash('sha256').update(`${ctx.workspace.id}:${task}`).digest('hex').slice(0, 20)}`;
  };
  const read = () => readState(ctx.directory, ctx.common);
  // Mutations serialize on the registry lock; a build holds it only around registry updates.
  const locked = <T>(operation: (state: ReturnType<typeof read>) => Promise<T> | T) =>
    withLock(ctx.directory, async () => {
      const state = read();
      registerWorkspace(ctx, state);
      return operation(state);
    });
  let result: unknown;
  switch (command) {
    case 'status':
      result = inventory(ctx, read());
      break;
    case 'reconcile':
      result = values['dry-run']
        ? await reconcile(ctx, read(), true)
        : await locked((state) => reconcile(ctx, state));
      break;
    case 'fingerprint':
      result = { platform: platform(), fingerprint: fingerprint(ctx.cwd, platform()) };
      break;
    case 'build':
      result = await build(ctx, platform(), values.source ? realpathSync(values.source) : ctx.cwd);
      break;
    case 'adopt':
      if (!values.device) throw new Error('adopt requires --device.');
      result = await locked((state) => adopt(ctx, state, platform(), values.device!));
      break;
    case 'start':
      result = await locked((state) =>
        start(ctx, state, platform(), session(), !!values['reset-data']),
      );
      break;
    case 'release':
      result = await locked(async (state) => ({
        warnings: await release(ctx, state, ctx.workspace.id, session()),
      }));
      break;
    case 'archive':
      result = await locked((state) => {
        state.workspaces.find((w) => w.id === ctx.workspace.id)!.archived = true;
        saveState(ctx.directory, state);
        return reconcile(ctx, state);
      });
      break;
  }
  const incomplete = !!(
    result &&
    typeof result === 'object' &&
    'warnings' in result &&
    Array.isArray(result.warnings) &&
    result.warnings.length
  );
  console.log(JSON.stringify({ ok: !incomplete, command, result }, null, 2));
  if (incomplete) process.exitCode = 2;
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }),
  );
  process.exitCode = 1;
});
