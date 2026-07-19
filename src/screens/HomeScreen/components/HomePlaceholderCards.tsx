import { View } from 'react-native';

// Placeholder content: exists only to give the Home tab enough scrollable
// height to exercise the sticky-header animation. Replace this whole component
// with the real home content when it lands.
const placeholderCardIds = Array.from({ length: 8 }, (_, index) => `home-placeholder-${index}`);

export function HomePlaceholderCards() {
  return (
    <>
      {placeholderCardIds.map((id) => (
        <View className="h-24 rounded-2xl bg-surface" key={id} />
      ))}
    </>
  );
}
