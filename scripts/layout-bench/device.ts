/**
 * agent-device / simctl 的薄封装。
 *
 * 刻意保持薄：驱动层唯一确定的事实是「agent-device 看不到 RN 内容」（滚动区在无障碍树里
 * 只剩匿名节点，文本选择器一律 miss），所以本层只提供坐标点击、输入、滑动、截图与日志四件
 * 事，定位交给上层的固定坐标表。要换成 argent 之类走 RN 组件树的驱动，只需替换本文件。
 */

import { execFileSync } from 'child_process';

export const APP_BUNDLE_ID = 'com.cherry-ai.cherry-studio-app';

export class Device {
  constructor(private readonly udid: string) {}

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

  private agentDevice(args: string[]): string {
    return execFileSync('agent-device', [...args, '--udid', this.udid], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
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
