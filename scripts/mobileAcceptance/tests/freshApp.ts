import { test as base } from '@e2e-dev/mobile';
import { expect, type Screen } from 'e2e';

import { expectChat, LAUNCH_TIMEOUT } from './conversation';
import {
  MOCK_API_KEY,
  MOCK_MODEL,
  startMockChatService,
  type MockChatService,
} from './mockChatService';

const metroPort = process.env.CONDUCTOR_PORT ?? '8081';

// Every test starts from cleared app data, set up through onboarding against the local service,
// so no result depends on what an earlier run or another branch left on the device.
export const test = base.extend<{ chat: MockChatService }>({
  chat: async ({ app, device, platform, screen }, provide) => {
    // Each platform has one device and its own port so both targets can run concurrently.
    const servicePort = process.env.CONDUCTOR_PORT
      ? Number(process.env.CONDUCTOR_PORT) + (platform === 'ios' ? 1 : 2)
      : 0;
    const chat = await startMockChatService(servicePort);
    try {
      await app.clearState();
      if (platform === 'android') {
        // Clearing data also forgets the development client's last bundle.
        const metro = encodeURIComponent(`http://10.0.2.2:${metroPort}`);
        await device.openLink(`exp+cherry-studio://expo-development-client/?url=${metro}`);
      }
      await completeOnboarding(screen, chat.baseUrl(platform));
      await provide(chat);
    } finally {
      await chat.close();
    }
  },
});

async function completeOnboarding(screen: Screen, baseUrl: string): Promise<void> {
  const decline = screen.getByRole('button', '不同意');
  await expect(decline).toBeVisible({ timeout: LAUNCH_TIMEOUT });
  await decline.tap();

  // A tap during the welcome intro only skips it.
  const skipIntro = screen.getByTestId('onboarding-intro-skip');
  if (await skipIntro.isVisible()) await skipIntro.tap();
  await screen.getByTestId('onboarding-connect').tap();
  await screen.getByTestId('onboarding-provider-custom').tap();

  await screen.getByTestId('provider-rename').tap();
  const name = screen.getByTestId('provider-rename-sheet-input');
  await name.fill('Cherry E2E');
  await expect(name).toHaveValue('Cherry E2E');
  await screen.getByTestId('provider-rename-sheet-submit').tap();
  await screen.getByTestId('provider-endpoint-openai-chat-completions').tap();
  await screen.getByTestId('provider-address-sheet-input').fill(baseUrl);
  await screen.getByTestId('provider-address-sheet-submit').tap();
  await screen.getByTestId('provider-first-api-key-input').fill(MOCK_API_KEY);
  await screen.getByTestId('provider-first-api-key-add').tap();
  await screen.getByTestId('provider-continue').tap();

  await screen.getByTestId('onboarding-model-mode-toggle').tap();
  await screen.getByTestId('onboarding-model-manual-input').fill(MOCK_MODEL);
  // Completion requires a real reply from the local service.
  await screen.getByTestId('onboarding-model-start').tap();
  await expectChat(screen);
}
