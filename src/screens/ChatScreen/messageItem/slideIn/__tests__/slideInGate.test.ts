import { createSlideInGate } from '../slideInGate';

describe('createSlideInGate', () => {
  test('授权当前目标消息播放一次', () => {
    const gate = createSlideInGate();

    expect(gate.claim('user-1', 'user-1')).toBe(true);
  });

  test('目标存活期间同一条消息不重复播放（防虚拟列表 remount 重播）', () => {
    const gate = createSlideInGate();

    expect(gate.claim('user-1', 'user-1')).toBe(true);
    // 滚出再滚回导致的 remount：targetId 仍是它，但已播过 → 不再播。
    expect(gate.claim('user-1', 'user-1')).toBe(false);
  });

  test('没有目标（pending 已清空）时不播放', () => {
    const gate = createSlideInGate();

    expect(gate.claim('user-1', undefined)).toBe(false);
  });

  test('非目标消息（历史 / 加载的更早消息）不播放', () => {
    const gate = createSlideInGate();

    expect(gate.claim('history-1', 'user-9')).toBe(false);
    // 历史消息此后 remount 也始终不播。
    expect(gate.claim('history-1', 'user-9')).toBe(false);
  });

  test('连续发送多条时，每条各自播放一次', () => {
    const gate = createSlideInGate();

    expect(gate.claim('user-1', 'user-1')).toBe(true);
    // 第二次发送：目标切到 user-2；user-1 若因滚动 remount 不再命中新目标。
    expect(gate.claim('user-1', 'user-2')).toBe(false);
    expect(gate.claim('user-2', 'user-2')).toBe(true);
    expect(gate.claim('user-2', 'user-2')).toBe(false);
  });
});
