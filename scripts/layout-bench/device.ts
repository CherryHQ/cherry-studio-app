/**
 * agent-device / simctl 的薄封装。
 *
 * 刻意保持薄：驱动层唯一确定的事实是「agent-device 看不到 RN 内容」（滚动区在无障碍树里
 * 只剩匿名节点，文本选择器一律 miss），所以本层只提供坐标点击、输入、滑动、截图与日志四件
 * 事，定位交给上层的固定坐标表。要换成 argent 之类走 RN 组件树的驱动，只需替换本文件。
 */

import { execFileSync } from 'child_process';

export const APP_BUNDLE_ID = 'com.cherry-ai.cherry-studio-app';

/** dev client 启动页上「打开」按钮的文案；系统弹窗在无障碍树里是可见的，能按文案点。 */
const OPEN_IN_APP_LABEL = '打开';

export class Device {
  constructor(private readonly udid: string) {}

  /**
   * 把 app 拉回「正在跑我们的 bundle」的状态。
   *
   * 必须有这一步：每个场景开头的 `logs clear --restart` 会重启 app，而 dev client 重启后
   * 常常停在自己的启动页（服务器列表）而不是自动接回 Metro。这时后续所有坐标点击都落在
   * 启动页上，`type` 会以一句无从诊断的 XCTest 失败告终——整轮报错，却看不出是环境掉了。
   *
   * 从 app 外面打开 dev client 的 URL 会先弹一个「在 App 中打开？」的系统确认框，所以紧接着
   * 按文案点一次「打开」；已经在正确状态时这一步会自然失败，忽略即可。
   */
  ensureDevClientAttached(metroUrl: string): void {
    this.openUrl(`${APP_BUNDLE_ID}://expo-development-client/?url=${encodeURIComponent(metroUrl)}`);

    try {
      // 静音 stderr：没有确认框时 agent-device 会打一条 "Selector did not match"，
      // 而那是正常路径之一，让它出现在报告里只会误导。
      this.agentDevice(['press', `label=${OPEN_IN_APP_LABEL}`, '--settle'], 'ignore');
    } catch {
      // 同上。
    }
  }

  /** dev menu 的悬浮按钮会吞掉右上角点击；与 `e2e:ios:prepare` 用同一种关法。 */
  disableDevMenuFloatingButton(): void {
    try {
      execFileSync(
        'xcrun',
        [
          'simctl',
          'spawn',
          this.udid,
          'defaults',
          'write',
          APP_BUNDLE_ID,
          'EXDevMenuShowFloatingActionButton',
          '-bool',
          'NO',
        ],
        { stdio: 'ignore' },
      );
    } catch {
      // 关不掉不致命：坐标表已避开右上角。
    }
  }

  logsClear(): void {
    this.agentDevice(['logs', 'clear', '--restart']);
  }

  logsMark(label: string): void {
    this.agentDevice(['logs', 'mark', label]);
  }

  logsPath(): string {
    // `logs path` 的输出里混有使用提示，真正的路径是最后一个以 / 开头的片段。
    const output = this.agentDevice(['logs', 'path']);
    const matched = output.match(/(\/\S+app\.log)/);
    if (!matched) {
      throw new Error(`无法从 agent-device logs path 的输出里解析日志路径：${output}`);
    }
    return matched[1];
  }

  openUrl(url: string): void {
    execFileSync('xcrun', ['simctl', 'openurl', this.udid, url], { stdio: 'ignore' });
  }

  press(x: number, y: number): void {
    this.agentDevice(['press', String(x), String(y)]);
  }

  screenshot(path: string): void {
    this.agentDevice(['screenshot', path]);
  }

  swipe(fromX: number, fromY: number, toX: number, toY: number): void {
    this.agentDevice(['swipe', String(fromX), String(fromY), String(toX), String(toY)]);
  }

  terminateApp(): void {
    try {
      execFileSync('xcrun', ['simctl', 'terminate', this.udid, APP_BUNDLE_ID], {
        stdio: 'ignore',
      });
    } catch {
      // 应用本来就没在跑。
    }
  }

  type(text: string): void {
    this.agentDevice(['type', text]);
  }

  private agentDevice(args: string[], stderr: 'inherit' | 'ignore' = 'inherit'): string {
    return execFileSync('agent-device', [...args, '--udid', this.udid], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', stderr],
    });
  }
}

export function listBootedSimulators(): Array<{ name: string; udid: string }> {
  const raw = execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted', '--json'], {
    encoding: 'utf8',
  });
  const parsed = JSON.parse(raw) as {
    devices: Record<string, Array<{ name: string; udid: string }>>;
  };

  return Object.values(parsed.devices).flat();
}

/**
 * 解析目标模拟器：显式参数 > 环境变量 > 唯一在跑的那台。
 *
 * 多台在跑时**不**猜：这台机器上常有多个并行 workspace 各自开着模拟器，选错会把别人的
 * 环境搅乱，报错让人显式指定更安全。
 */
export function resolveUdid(explicit?: string): string {
  const fromEnv = explicit ?? process.env.LAYOUT_BENCH_UDID;
  if (fromEnv) {
    return fromEnv;
  }

  const booted = listBootedSimulators();
  if (booted.length === 1) {
    return booted[0].udid;
  }

  if (booted.length === 0) {
    throw new Error('没有已启动的模拟器；先启动一台，或用 --udid 指定。');
  }

  const listed = booted.map((device) => `  ${device.udid}  ${device.name}`).join('\n');
  throw new Error(
    `有 ${booted.length} 台模拟器在跑，请用 --udid 或 LAYOUT_BENCH_UDID 指定：\n${listed}`,
  );
}
