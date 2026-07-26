import { GlassView } from 'expo-glass-effect';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PlatformColor, Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { type McpServerTabsProps, mcpServerTabs } from './types';

const labelKeys = {
  configuration: 'settings.mcp.tabs.configuration',
  tools: 'settings.mcp.tools.title',
} as const;

const indicatorInset = 3;
const tabHeight = 34;
const tabWidth = 144;
const segmentWidth = tabWidth / mcpServerTabs.length;
const indicatorWidth = segmentWidth - indicatorInset * 2;

export function McpServerTabs({ isDisabled = false, onTabChange, tab }: McpServerTabsProps) {
  const { t } = useTranslation();
  const translateX = useSharedValue(0);

  useEffect(() => {
    translateX.value = withTiming(mcpServerTabs.indexOf(tab) * segmentWidth + indicatorInset, {
      duration: 220,
    });
  }, [tab, translateX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    width: indicatorWidth,
  }));

  return (
    <View collapsable={false} style={{ height: tabHeight, width: tabWidth }}>
      <GlassView
        glassEffectStyle="regular"
        isInteractive
        style={{
          borderRadius: tabHeight / 2,
          height: tabHeight,
          overflow: 'hidden',
          width: tabWidth,
        }}
      >
        <Animated.View
          className="absolute left-0 rounded-full"
          pointerEvents="none"
          style={[
            {
              backgroundColor: PlatformColor('tertiarySystemFill'),
              bottom: indicatorInset,
              top: indicatorInset,
            },
            indicatorStyle,
          ]}
        />
        <View className="h-full flex-row">
          {mcpServerTabs.map((item) => {
            const isSelected = item === tab;

            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ disabled: isDisabled, selected: isSelected }}
                className="h-full flex-1 items-center justify-center"
                disabled={isDisabled}
                hitSlop={{ bottom: 5, top: 5 }}
                key={item}
                onPress={() => onTabChange(item)}
                testID={`mcp-server-tab-${item}`}
              >
                <Text
                  adjustsFontSizeToFit
                  className="font-medium"
                  maxFontSizeMultiplier={1.2}
                  minimumFontScale={0.9}
                  numberOfLines={1}
                  style={{
                    color: PlatformColor(isSelected ? 'label' : 'secondaryLabel'),
                    fontSize: 13,
                    lineHeight: 16,
                  }}
                >
                  {t(labelKeys[item])}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </GlassView>
    </View>
  );
}
