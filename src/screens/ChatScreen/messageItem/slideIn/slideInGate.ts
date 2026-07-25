// 决定「哪条用户消息该播 slide-in 入场动画」的纯逻辑，刻意不依赖 reanimated/React，
// 便于单测。语义：只有「当前刚发送的目标消息」且「本次尚未播过」才授权一次。
//
// 为什么需要 played 守卫：LegendList 虚拟化下，被锚定的用户消息可能在 pending 存活期间
// 滚出 drawDistance 被卸载、滚回来又 remount；若只比对 targetId，remount 会重播。played
// 记录保证「每条 id 在其作为 target 期间只播一次」。pending 落库清空后 targetId 变化，
// 天然不再命中，双重保险。

export interface SlideInGate {
  /**
   * 在用户消息 mount 时调用一次。若该消息是当前应播 slide-in 的目标且尚未播过，
   * 返回 true 并记为已播；否则返回 false。
   */
  claim(messageId: string, targetId: string | undefined): boolean;
}

export function createSlideInGate(): SlideInGate {
  const played = new Set<string>();

  return {
    claim(messageId, targetId) {
      if (!targetId || messageId !== targetId) {
        return false;
      }

      if (played.has(messageId)) {
        return false;
      }

      played.add(messageId);
      return true;
    },
  };
}
