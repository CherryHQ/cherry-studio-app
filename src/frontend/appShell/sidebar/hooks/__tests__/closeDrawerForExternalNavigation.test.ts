import type { DrawerContentComponentProps } from 'expo-router/drawer';

import { closeDrawerForExternalNavigation } from '../closeDrawerForExternalNavigation';

jest.mock('expo-router/drawer', () => ({
  getDrawerStatusFromState: (state: { status: string }) => state.status,
}));

function setup(status = 'open') {
  let transition!: (event: { data: { closing: boolean } }) => void;
  const unsubscribe = jest.fn();
  const closeDrawer = jest.fn();
  const navigation = {
    getState: () => ({ status }),
    closeDrawer,
    addListener: jest.fn((_event, listener) => {
      transition = listener;
      return unsubscribe;
    }),
  } as unknown as DrawerContentComponentProps['navigation'];
  const controller = new AbortController();
  return {
    navigation,
    controller,
    closeDrawer,
    unsubscribe,
    transition: (closing: boolean) => transition({ data: { closing } }),
  };
}

test('waits for the closing transition and removes its listener before launching', async () => {
  const state = setup();
  const settled = jest.fn();
  const ready = closeDrawerForExternalNavigation(state.navigation, false, state.controller.signal);
  void ready.then(settled);
  await Promise.resolve();
  expect(settled).not.toHaveBeenCalled();
  expect(state.closeDrawer).toHaveBeenCalledTimes(1);
  state.transition(true);
  await expect(ready).resolves.toBe(true);
  expect(state.unsubscribe).toHaveBeenCalledTimes(1);
});

test.each(['reopen', 'abort'])(
  '%s cancels the handoff and cleans up the listener',
  async (action) => {
    const state = setup();
    const ready = closeDrawerForExternalNavigation(
      state.navigation,
      false,
      state.controller.signal,
    );
    if (action === 'reopen') state.transition(false);
    else state.controller.abort();
    await expect(ready).resolves.toBe(false);
    expect(state.unsubscribe).toHaveBeenCalledTimes(1);
  },
);

test.each([
  ['closed', false],
  ['open', true],
] as const)('does not wait for a %s permanent=%s drawer', async (status, permanent) => {
  const state = setup(status);
  await expect(
    closeDrawerForExternalNavigation(state.navigation, permanent, state.controller.signal),
  ).resolves.toBe(true);
  expect(state.closeDrawer).not.toHaveBeenCalled();
  expect(state.navigation.addListener).not.toHaveBeenCalled();
});
