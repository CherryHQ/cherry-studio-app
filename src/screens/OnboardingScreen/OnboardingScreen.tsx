import { Button } from 'heroui-native/button';
import { Slider } from 'heroui-native/slider';
import { Switch } from 'heroui-native/switch';
import { Text } from 'heroui-native/text';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { LogoDrawAnimation, type LogoDrawAnimationRef } from './logoDraw';

/**
 * Onboarding entry screen. Currently a skeleton hosting the logo draw
 * animation; the real onboarding content (copy, pager, actions) lands later.
 */
export function OnboardingScreen() {
  const logoRef = useRef<LogoDrawAnimationRef>(null);
  const scrub = useSharedValue(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [debug, setDebug] = useState(false);

  return (
    <View className="flex-1 items-center justify-center gap-16 bg-background">
      <LogoDrawAnimation
        debug={debug}
        progress={scrubbing ? scrub : undefined}
        ref={logoRef}
        size={180}
      />
      {__DEV__ ? (
        <LogoDrawDevPanel
          debug={debug}
          onDebugChange={setDebug}
          onReplay={() => logoRef.current?.replay()}
          onScrub={(value) => {
            scrub.value = value;
          }}
          onScrubbingChange={setScrubbing}
          scrubbing={scrubbing}
        />
      ) : null}
    </View>
  );
}

/** Dev-only calibration controls; not part of the future onboarding UI. */
function LogoDrawDevPanel({
  debug,
  onDebugChange,
  onReplay,
  onScrub,
  onScrubbingChange,
  scrubbing,
}: {
  debug: boolean;
  onDebugChange: (debug: boolean) => void;
  onReplay: () => void;
  onScrub: (value: number) => void;
  onScrubbingChange: (scrubbing: boolean) => void;
  scrubbing: boolean;
}) {
  const [value, setValue] = useState(0);

  return (
    <View className="w-72 gap-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-foreground">Debug centerlines</Text>
        <Switch isSelected={debug} onSelectedChange={onDebugChange} />
      </View>
      <View className="flex-row items-center justify-between">
        <Text className="text-foreground">Scrub</Text>
        <Switch isSelected={scrubbing} onSelectedChange={onScrubbingChange} />
      </View>
      {scrubbing ? (
        <Slider
          maxValue={1}
          minValue={0}
          onChange={(next) => {
            const single = Array.isArray(next) ? (next[0] ?? 0) : next;
            setValue(single);
            onScrub(single);
          }}
          step={0.005}
          value={value}
        >
          <Slider.Output />
          <Slider.Track>
            <Slider.Fill />
            <Slider.Thumb />
          </Slider.Track>
        </Slider>
      ) : (
        <Button onPress={onReplay} variant="secondary">
          <Text className="text-foreground">Replay</Text>
        </Button>
      )}
    </View>
  );
}
