import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { cn } from '@cherrystudio/ui/utils';
import { type ComponentProps, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { useUniwind } from 'uniwind';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import { getSidebarBranchLayout } from './sidebarBranchLayout';
import { useSidebarBranchRow } from './SidebarBranchScrollView';
import { SIDEBAR_LEADING_SIZE, SIDEBAR_ROW_GAP, SIDEBAR_ROW_INSET } from './SidebarRowContent';

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

/** Reserves real tree indentation; the row owns its own 12pt text gap. */
export function SidebarSessionBranchLeading({
  leading,
  depth,
}: {
  leading?: ReactNode;
  depth: number;
}) {
  const rail = <View style={{ width: getSidebarBranchLayout(depth).indentation }} />;
  return leading ? (
    <View className="flex-row items-center" style={{ gap: SIDEBAR_ROW_GAP }}>
      {leading}
      {rail}
    </View>
  ) : (
    rail
  );
}

/** Selection covers the complete row; callers wrap its canvas in stationary interaction targets. */
export function SidebarSessionBranchFrame({
  children,
  position,
  leading,
  selected = false,
  disclosure,
  layout,
  exiting,
}: {
  children: (renderCanvas: (content: ReactNode) => ReactNode) => ReactNode;
  position?: SidebarSessionBranchPosition;
  leading?: ReactNode;
  selected?: boolean;
  disclosure?: ReactNode;
} & Pick<ComponentProps<typeof Animated.View>, 'layout' | 'exiting'>) {
  const [height, setHeight] = useState(44);
  const { ref, viewport } = useSidebarBranchRow(position?.depth ?? 0);
  const width = useSharedValue(0);
  const offset = viewport?.offset;
  const indentation = getSidebarBranchLayout(position?.depth ?? 0).indentation;
  const canvasStyle = useAnimatedStyle(() => {
    // A shallower sibling must not lose its title's beginning beyond the left viewport edge.
    const shift = Math.min(indentation, offset?.get() ?? 0);
    return {
      // Keep the text/status trailing edge fixed while the real indentation moves left.
      width: width.get() > 0 ? width.get() + shift : ('100%' as const),
      transform: [{ translateX: -shift }],
    };
  });
  return (
    <Animated.View
      ref={ref}
      collapsable={false}
      layout={layout}
      exiting={exiting}
      className={cn(
        'relative min-h-11 flex-row items-stretch rounded-xl',
        selected && 'bg-secondary/70',
      )}
      onLayout={(event) => {
        setHeight(event.nativeEvent.layout.height);
        viewport?.refresh();
      }}
    >
      <View
        className="min-w-0 flex-1 overflow-hidden"
        onLayout={(event) => width.set(event.nativeEvent.layout.width)}
      >
        {children((content) => (
          <Animated.View className="relative" style={canvasStyle}>
            {content}
            {position ? (
              <SidebarSessionBranchRail
                position={position}
                height={height}
                leading={Boolean(leading)}
                selected={selected}
              />
            ) : null}
          </Animated.View>
        ))}
      </View>
      {disclosure}
    </Animated.View>
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
  const layout = getSidebarBranchLayout(position.depth, position.ancestorContinuations);
  const x = SIDEBAR_ROW_INSET + layout.indentation;
  const center = height / 2;
  const parent = SIDEBAR_ROW_INSET + layout.parentIndentation;
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
      {layout.ancestorIndentations.map((indentation) => (
        <Line
          key={indentation}
          x1={SIDEBAR_ROW_INSET + indentation}
          x2={SIDEBAR_ROW_INSET + indentation}
          y1={0}
          y2={height}
          stroke={line}
          strokeWidth={1.35}
        />
      ))}
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
