import { fromByteArray } from 'base64-js';

import { NativeRelayWebSocket } from '../relaySocket';

jest.mock('react-native-quick-base64', () => jest.requireActual('base64-js'));

function setup() {
  let receive!: Parameters<ConstructorParameters<typeof NativeRelayWebSocket>[0]['addListener']>[1];
  const remove = jest.fn();
  const native = {
    addListener: jest.fn((_name, listener) => {
      receive = listener;
      return { remove };
    }),
    connect: jest.fn(),
    send: jest.fn<Promise<void>, [string, string, boolean]>(),
    received: jest.fn(),
    close: jest.fn(),
  };
  const socket = new NativeRelayWebSocket(native, 'wss://relay.example.com/v1/relay');
  const event = (type: 'open' | 'message' | 'close' | 'error', data?: string, binary?: boolean) => {
    const id = native.connect.mock.calls[0][0];
    receive({ id, type, data, binary });
  };
  return { native, socket, event, remove };
}
const tick = () => Promise.resolve();

it('includes the native in-flight write in bufferedAmount and sends copied binary data in order', async () => {
  const { socket, native, event } = setup();
  await tick();
  event('open');
  const completed: (() => void)[] = [];
  native.send.mockImplementation(() => new Promise((resolve) => completed.push(resolve)));
  const bytes = new Uint8Array([1, 2, 3]);
  socket.send('start');
  socket.send(bytes);
  bytes[0] = 255;
  expect(socket.bufferedAmount).toBe(8);
  expect(native.send).toHaveBeenCalledTimes(1);
  completed[0]();
  await tick();
  expect(socket.bufferedAmount).toBe(3);
  expect(native.send.mock.calls[1].slice(1)).toEqual([
    fromByteArray(new Uint8Array([1, 2, 3])),
    true,
  ]);
  completed[1]();
  await tick();
  expect(socket.bufferedAmount).toBe(0);
  socket.close();
});

it('bounds an unresponsive native sender and discards queued writes on close', async () => {
  const { socket, native, event, remove } = setup();
  await tick();
  event('open');
  let completed!: () => void;
  native.send.mockReturnValue(
    new Promise((resolve) => {
      completed = resolve;
    }),
  );
  const frame = new Uint8Array(65_536);
  for (let i = 0; i < 16; i++) socket.send(frame);
  expect(socket.bufferedAmount).toBe(1_048_576);
  expect(() => socket.send(frame)).toThrow('queue limit');
  expect(socket.readyState).toBe(3);
  completed();
  await tick();
  expect(socket.bufferedAmount).toBe(0);
  expect(native.send).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledTimes(1);
});

it('acknowledges native delivery only after synchronous handlers and snapshots listeners per event', async () => {
  const { socket, native, event } = setup();
  await tick();
  event('open');
  const data = jest.fn();
  const control = jest.fn(() => {
    expect(native.received).not.toHaveBeenCalled();
    socket.removeEventListener('message', control);
    socket.addEventListener('message', data);
  });
  socket.addEventListener('message', control);
  event('message', 'ready', false);
  expect(data).not.toHaveBeenCalled();
  event('message', 'AQID', true);
  expect(data).toHaveBeenCalledWith({ data: new Uint8Array([1, 2, 3]) });
  expect(native.received).toHaveBeenCalledTimes(2);
  socket.close();
});

it('does not open a socket cancelled before native dispatch', async () => {
  const { socket, native, remove } = setup();
  socket.close();
  await tick();
  expect(native.connect).not.toHaveBeenCalled();
  expect(remove).toHaveBeenCalledTimes(1);
});

it('closes once on native send failure and ignores late events', async () => {
  const { socket, native, event } = setup();
  await tick();
  event('open');
  const closed = jest.fn();
  socket.addEventListener('close', closed);
  native.send.mockRejectedValue(new Error('native write failed'));
  socket.send('start');
  await tick();
  event('open');
  event('close');
  socket.close();
  expect(closed).toHaveBeenCalledTimes(1);
  expect(socket.readyState).toBe(3);
});
