import { View } from 'react-native';

import { LogoDrawAnimation } from './logoDraw';

/**
 * Onboarding entry screen. Currently a skeleton hosting the logo draw
 * animation; the real onboarding content (copy, pager, actions) lands later.
 */
export function OnboardingScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <LogoDrawAnimation size={180} />
    </View>
  );
}
