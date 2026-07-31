import { GlassView } from 'expo-glass-effect';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PlatformColor, Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useSearchScope } from '../context/SearchScopeProvider';
import { getSearchScopeIndex, searchScopes } from '../utils/searchScope';

const labelKeys = {
  assistants: 'navigation.assistants',
  messages: 'navigation.messages',
  settings: 'navigation.settings',
} as const;

const segmentCount = searchScopes.length;
const indicatorInset = 3;

export function SearchScopeTabs() {
  const { t } = useTranslation();
  const { scope, setScope } = useSearchScope();
  const [width, setWidth] = useState(0);
  const translateX = useSharedValue(0);
  const segmentWidth = width / segmentCount;
  const indicatorWidth = Math.max(0, segmentWidth - indicatorInset * 2);

  useEffect(() => {
    translateX.value = withTiming(getSearchScopeIndex(scope) * segmentWidth + indicatorInset, {
      duration: 220,
    });
  }, [scope, segmentWidth, translateX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    width: indicatorWidth,
  }));

  return (
    <View className="h-12 w-full items-center justify-center px-2">
      <GlassView
        isInteractive
        glassEffectStyle="regular"
        style={{
          width: '100%',
          height: 40,
          overflow: 'hidden',
          borderRadius: 20,
        }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {width > 0 ? (
          <Animated.View
            className="absolute left-0 rounded-full"
            pointerEvents="none"
            style={[
              {
                top: indicatorInset,
                bottom: indicatorInset,
                backgroundColor: PlatformColor('tertiarySystemFill'),
              },
              indicatorStyle,
            ]}
          />
        ) : null}
        <View className="h-full flex-row">
          {searchScopes.map((item) => {
            const isSelected = item === scope;

            return (
              <Pressable
                key={item}
                accessibilityRole="tab"
                accessibilityState={{ selected: isSelected }}
                className="h-10 flex-1 items-center justify-center"
                testID={`search-scope-tab-${item}`}
                onPress={() => setScope(item)}
              >
                <Text
                  className="font-medium text-sm"
                  style={{
                    color: PlatformColor(isSelected ? 'label' : 'secondaryLabel'),
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
