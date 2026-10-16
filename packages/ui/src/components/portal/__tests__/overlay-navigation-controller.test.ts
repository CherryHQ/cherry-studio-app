import { createOverlayNavigation } from '../overlay-navigation-controller';

test('waits for every dismissed overlay to leave, not merely receive a close request', async () => {
  const controller = createOverlayNavigation();
  const dismiss = jest.fn();
  const removeFirst = controller.register(dismiss);
  const removeSecond = controller.register(dismiss);
  const finished = jest.fn();
  const pending = controller.prepareForNavigation(new AbortController().signal).then(finished);
  expect(dismiss).toHaveBeenCalledTimes(2);
  removeFirst();
  await Promise.resolve();
  expect(finished).not.toHaveBeenCalled();
  removeSecond();
  await pending;
  expect(finished).toHaveBeenCalledWith(true);
});

test('blocking dialogs and non-dismissible sheets prevent any automatic dismissal', async () => {
  const controller = createOverlayNavigation();
  const dismiss = jest.fn();
  controller.register(dismiss);
  controller.register();
  await expect(controller.prepareForNavigation(new AbortController().signal)).resolves.toBe(false);
  expect(dismiss).not.toHaveBeenCalled();
});

test('a new overlay during dismissal cancels the pending handoff', async () => {
  const controller = createOverlayNavigation();
  const remove = controller.register(jest.fn());
  const pending = controller.prepareForNavigation(new AbortController().signal);
  controller.register();
  remove();
  await expect(pending).resolves.toBe(false);
});

test('abort releases a pending handoff and subsequent navigation can retry', async () => {
  const controller = createOverlayNavigation();
  const remove = controller.register(jest.fn());
  const abort = new AbortController();
  const pending = controller.prepareForNavigation(abort.signal);
  abort.abort();
  await expect(pending).resolves.toBe(false);
  remove();
  await expect(controller.prepareForNavigation(new AbortController().signal)).resolves.toBe(true);
  await expect(controller.prepareForNavigation(abort.signal)).resolves.toBe(false);
});

test('a dialog opening in the same commit as the final dismissal prevents navigation', async () => {
  const controller = createOverlayNavigation();
  const remove = controller.register(jest.fn());
  const pending = controller.prepareForNavigation(new AbortController().signal);
  remove();
  controller.register();
  await expect(pending).resolves.toBe(false);
});

test('reports overlay presence until dismissal completes and releases subscriptions', () => {
  const controller = createOverlayNavigation();
  const listener = jest.fn();
  const stop = controller.subscribe(listener);
  expect(controller.hasOverlays()).toBe(false);
  const remove = controller.register();
  expect(controller.hasOverlays()).toBe(true);
  expect(listener).toHaveBeenCalledTimes(1);
  remove();
  expect(controller.hasOverlays()).toBe(false);
  expect(listener).toHaveBeenCalledTimes(2);
  stop();
  controller.register();
  expect(listener).toHaveBeenCalledTimes(2);
});

test('admission is read-only and blocks only decision surfaces', () => {
  const controller = createOverlayNavigation();
  const dismiss = jest.fn();
  expect(controller.canNavigate()).toBe(true);
  controller.register(dismiss);
  expect(controller.canNavigate()).toBe(true);
  expect(dismiss).not.toHaveBeenCalled();
  const remove = controller.register();
  expect(controller.canNavigate()).toBe(false);
  expect(dismiss).not.toHaveBeenCalled();
  remove();
  expect(controller.canNavigate()).toBe(true);
});
