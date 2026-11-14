import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { mobile } from '@e2e-dev/mobile';
import { mobileTools } from '@e2e-dev/mobile/tools';
import type { E2EConfig } from 'e2e';

import { agentModel } from './agentModel';

const localEnv = new URL('.env', import.meta.url);
if (existsSync(localEnv)) process.loadEnvFile(localEnv);

const iosDevice = process.env.CHERRY_ACCEPTANCE_IOS_DEVICE;
const androidDevice = process.env.CHERRY_ACCEPTANCE_ANDROID_DEVICE;
// Every test clears app data; the resident devices keep configuration shared by all workspaces.
for (const device of [iosDevice, androidDevice]) {
  if (device === 'Cherry Test' || device === 'Cherry_Test') {
    throw new Error(
      `${device} is a resident device; acceptance clears app data, so use a temporary one.`,
    );
  }
}
const metroPort = process.env.CONDUCTOR_PORT ?? '8081';

const ios = iosDevice ? mobile({ platform: 'ios', device: iosDevice }) : undefined;
const android = androidDevice ? mobile({ platform: 'android', device: androidDevice }) : undefined;
const [firstEngine, ...otherEngines] = [ios, android].filter((engine) => engine !== undefined);
// Without an explicit device the engine would claim every booted simulator, including other
// workspaces' devices.
if (!firstEngine) {
  throw new Error('Set CHERRY_ACCEPTANCE_IOS_DEVICE and/or CHERRY_ACCEPTANCE_ANDROID_DEVICE.');
}
const agent = agentModel();

export default {
  projectId: 'cherry-mobile-acceptance',
  targets: [
    ...(ios
      ? [
          {
            name: 'ios',
            engine: ios,
            app: {
              bundleId: 'com.cherryai.cherrystudio-app.dev',
              // Every fresh launch loads this workspace's Metro with the dev menu out of the way.
              launchArguments: [
                '--initialUrl',
                `http://localhost:${metroPort}`,
                '-EXDevMenuShowsAtLaunch',
                'NO',
                '-EXDevMenuIsOnboardingFinished',
                'YES',
                '-EXDevMenuShowFloatingActionButton',
                'NO',
              ],
            },
          },
        ]
      : []),
    // The Android development client reopens its most recently loaded bundle on a fresh launch.
    ...(android
      ? [
          {
            name: 'android',
            engine: android,
            app: { bundleId: 'com.cherryai.cherrystudio_app.dev' },
          },
        ]
      : []),
  ],
  ...(agent
    ? {
        agents: {
          default: {
            model: agent.model,
            tools: mobileTools(firstEngine, ...otherEngines),
            maxSteps: 20,
            maxModelCalls: 10,
            context:
              'Cherry Studio mobile app with a Simplified Chinese UI, talking to a local test service. 打开菜单 opens the side menu, which lists conversations; long-pressing a conversation opens its menu. Change nothing except as instructed: never send messages, submit feedback, back up, restore, clear data or open external links.',
          },
        },
        secrets: { 'acceptance-agent-key': agent.apiKey },
      }
    : {}),
  timeout: 240_000,
  launchTimeout: 120_000,
  retries: 0,
  reporters: ['list', 'markdown'],
  // Conductor workspaces share verified recordings, like the shared development clients.
  cache: {
    mode: 'read-write',
    dir: process.env.CONDUCTOR_ROOT_PATH
      ? join(process.env.CONDUCTOR_ROOT_PATH, '.local/mobile-acceptance-cache')
      : '.e2e/cache',
  },
} satisfies E2EConfig;
