import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { StyleSheet, Text } from 'react-native';

import { splitTextBlocks } from '../../../utils/text-blocks';
import { MessagePartSectionBody } from './message-part-sections';

/** Bounded native text blocks; the section's copy action retains the complete original value. */
export function MessagePartTextBody({
  variant = 'default',
  value,
}: {
  variant?: 'default' | 'preview';
  value: string;
}) {
  const blocks = splitTextBlocks(value);

  return (
    <MessagePartSectionBody>
      {variant === 'default' && blocks.length === 1 ? (
        <TextBlock selectable value={value} />
      ) : (
        <LegendList
          data={blocks}
          estimatedItemSize={480}
          extraData={variant}
          keyExtractor={blockKeyExtractor}
          nestedScrollEnabled
          // A native selection belongs to one block and must not follow a recycled text view.
          recycleItems={false}
          renderItem={renderTextBlock}
          scrollsToTop={false}
          showsVerticalScrollIndicator
          style={styles.viewport}
        />
      )}
    </MessagePartSectionBody>
  );
}

function TextBlock({ selectable, value }: { selectable: boolean; value: string }) {
  return (
    <Text className="text-base text-foreground" selectable={selectable}>
      {value}
    </Text>
  );
}

function renderTextBlock({ extraData, item }: LegendListRenderItemProps<string>) {
  return <TextBlock selectable={extraData !== 'preview'} value={item} />;
}

// Blocks stay in source order; updates replace their text, never reorder it.
function blockKeyExtractor(_block: string, index: number) {
  return String(index);
}

const styles = StyleSheet.create({ viewport: { height: 192 } });
