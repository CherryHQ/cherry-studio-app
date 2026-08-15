import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

/**
 * 助手消息里「一行状态」的骨架：待生成占位、思考中、工具调用三处共用。
 *
 * 收敛的不只是那串 className。这三行**必须等高**——它们占的是同一个槽位（「第一段内容
 * 将要出现的位置」），用户看到的是它们相互切换。三处各写一份时，待生成占位因为没有文字、
 * 只靠 20px 的圆点撑高，比另外两处矮 4px，切换那一帧整条助手消息在锚点正下方跳一下。
 */
const statusRowClassName = 'flex-row items-center gap-2 py-0.5';

type MessageStatusRowProps = {
  accessibilityLabel?: string;
  children: ReactNode;
  /** 给了就是可点的一行（思考块、工具调用），不给就是纯展示（待生成占位）。 */
  onPress?: () => void;
  testID?: string;
};

export function MessageStatusRow({
  accessibilityLabel,
  children,
  onPress,
  testID,
}: MessageStatusRowProps) {
  if (onPress) {
    return (
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        className={`${statusRowClassName} active:opacity-60`}
        onPress={onPress}
        testID={testID}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View accessibilityLabel={accessibilityLabel} className={statusRowClassName} testID={testID}>
      {children}
    </View>
  );
}

/**
 * 撑住一行正文的行高，**只有不含文字的状态行需要**（另外两处自己的 `text-base` 文字已经
 * 撑到位，再塞一个进去只会白占 4px 宽、挤掉 `numberOfLines={1}` 的截断余量）。
 *
 * 不能改成写死的 `minHeight`：行高随字号档位变（`--ui-text-base--line-height`），写死会在
 * 别的档位重新失配，只有同款文字跟得住。NBSP 而不是空格，是因为格式化器会把纯空格的 JSX
 * 子节点折掉。
 */
export function StatusRowTextFloor() {
  return (
    <Text accessible={false} className="text-base">
      {'\u00A0'}
    </Text>
  );
}
