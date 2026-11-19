import { expectChat } from './conversation';
import { test } from './freshApp';

test('common.onboarding, common.launch: first-run setup reaches chat and survives a relaunch', async ({
  app,
  screen,
}) => {
  await app.restart();
  await expectChat(screen);
  await app.screenshot('launch');
});
