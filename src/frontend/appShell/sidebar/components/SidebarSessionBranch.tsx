import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { cn } from '@cherrystudio/ui/utils';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { useUniwind } from 'uniwind';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import { SIDEBAR_LEADING_SIZE, SIDEBAR_ROW_GAP, SIDEBAR_ROW_INSET } from './SidebarRowContent';

const branchStep = 12;
export type SidebarSessionBranchAncestor = { sessionId: string; continues: boolean };
type BranchPosition = {
  depth: number;
  /** Trunks of earlier ancestors which still have a later visible sibling. */
  ancestorContinuations: readonly SidebarSessionBranchAncestor[];
};
export type SidebarSessionBranchPosition = BranchPosition &
  (
    | { kind: 'session'; hasFollowingSibling: boolean; expanded: boolean; onSelectedPath: boolean }
    | { kind: 'continuation' }
  );
export type SidebarSessionBranchAction = {
  expanded: boolean;
  toggle(): void;
};

/** Reserves only this node's indentation; the row owns its own 12pt text gap. */
export function SidebarSessionBranchLeading({
  leading,
  depth,
}: {
  leading?: ReactNode;
  depth: number;
}) {
  const rail = <View style={{ width: depth * branchStep }} />;
  return leading ? (
    <View className="flex-row items-center" style={{ gap: SIDEBAR_ROW_GAP }}>
      {leading}
      {rail}
    </View>
  ) : (
    rail
  );
}

/** Selection covers the complete row, including its sibling disclosure target. */
export function SidebarSessionBranchFrame({
  children,
  position,
  leading,
  selected = false,
}: {
  children: ReactNode;
  position?: SidebarSessionBranchPosition;
  leading?: ReactNode;
  selected?: boolean;
}) {
  const [height, setHeight] = useState(44);
  return (
    <View
      className={cn('relative flex-row items-stretch rounded-xl', selected && 'bg-secondary/70')}
      onLayout={position ? (event) => setHeight(event.nativeEvent.layout.height) : undefined}
    >
      {children}
      {position ? (
        <SidebarSessionBranchRail
          position={position}
          height={height}
          leading={Boolean(leading)}
          selected={selected}
        />
      ) : null}
    </View>
  );
}

function SidebarSessionBranchRail({
  position,
  height,
  leading,
  selected,
}: {
  position: SidebarSessionBranchPosition;
  height: number;
  leading: boolean;
  selected: boolean;
}) {
  const { theme } = useUniwind();
  const [foreground, line, surface] = useThemeColor([
    'foreground',
    'muted-foreground',
    theme === 'dark' ? 'sidebar' : 'background',
  ]);
  const x = SIDEBAR_ROW_INSET + position.depth * branchStep;
  const center = height / 2;
  const parent = x - branchStep;
  const onPath = position.kind === 'session' && position.onSelectedPath;
  return (
    <Svg
      accessible={false}
      pointerEvents="none"
      width={x + 4}
      height={height}
      style={{
        position: 'absolute',
        top: 0,
        left: leading ? SIDEBAR_LEADING_SIZE + SIDEBAR_ROW_GAP : 0,
      }}
    >
      {position.ancestorContinuations.map((ancestor, depth) =>
        ancestor.continues ? (
          <Line
            key={ancestor.sessionId}
            x1={SIDEBAR_ROW_INSET + depth * branchStep}
            x2={SIDEBAR_ROW_INSET + depth * branchStep}
            y1={0}
            y2={height}
            stroke={line}
            strokeWidth={1.35}
          />
        ) : null,
      )}
      {position.depth > 0 ? (
        position.kind === 'continuation' ? (
          <Line x1={parent} x2={parent} y1={0} y2={center} stroke={line} strokeWidth={1.35} />
        ) : (
          <>
            {position.hasFollowingSibling ? (
              <Line x1={parent} x2={parent} y1={0} y2={height} stroke={line} strokeWidth={1.35} />
            ) : null}
            <Path
              d={`M ${parent} 0 V ${center - 8} Q ${parent} ${center} ${parent + 8} ${center} H ${x}`}
              fill="none"
              stroke={onPath ? foreground : line}
              strokeWidth={onPath ? 1.8 : 1.35}
            />
          </>
        )
      ) : null}
      {position.kind === 'session' ? (
        <>
          {position.expanded ? (
            <Line
              x1={x}
              x2={x}
              y1={center}
              y2={height}
              stroke={onPath ? foreground : line}
              strokeWidth={1.35}
            />
          ) : null}
          <Circle
            cx={x}
            cy={center}
            r={3}
            stroke={selected ? foreground : line}
            strokeWidth={1.5}
            fill={selected ? foreground : surface}
          />
        </>
      ) : null}
    </Svg>
  );
}

/** A sibling of the navigation/menu target, so expanding never navigates. */
export function SidebarSessionBranchToggle({
  action,
  title,
  sessionId,
  disabled,
}: {
  action: SidebarSessionBranchAction;
  title: string;
  sessionId: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(
        action.expanded ? 'conversation.destination.collapse' : 'conversation.destination.expand',
        { name: title || t('session.list.untitled') },
      )}
      accessibilityState={{ expanded: action.expanded, disabled }}
      disabled={disabled}
      onPress={action.toggle}
      style={({ pressed }) => ({
        width: 44,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
      })}
      testID={`sidebar-session-expand-${sessionId}`}
    >
      {action.expanded ? (
        <ChevronDownIcon className="size-4 text-muted-foreground" />
      ) : (
        <ChevronRightIcon className="size-4 text-muted-foreground" />
      )}
    </Pressable>
  );
}
