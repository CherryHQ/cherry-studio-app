import { DotMatrixSquare20 } from '../../loading';
import type { MessagePartPendingProps } from '../message-part.types';
import { MessagePartStatus, MessagePartStatusTextFloor } from './message-part-status';

export function MessagePartPending({ accessibilityLabel, testID }: MessagePartPendingProps) {
  return (
    <MessagePartStatus testID={testID}>
      <DotMatrixSquare20 accessibilityLabel={accessibilityLabel} active size={20} />
      {/* Match a text status row so the first reasoning or content token does not shift the row. */}
      <MessagePartStatusTextFloor />
    </MessagePartStatus>
  );
}
