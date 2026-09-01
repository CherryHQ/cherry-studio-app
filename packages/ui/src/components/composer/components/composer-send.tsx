import ArrowUpIcon from '@cherrystudio/app-icons/icons/arrow-up';
import SquareIcon from '@cherrystudio/app-icons/icons/square';

import { cn } from '../../../utils';
import type { ComposerSendProps } from '../composer.types';
import { useComposerActions, useComposerState } from '../hooks/use-composer-context';
import { ComposerAction } from './composer-action';

// Pins itself right, so tools written before it in the toolbar pack left and
// adding one never moves the send button.
const sendStyle = { marginLeft: 'auto' } as const;

/**
 * The primary action: a send arrow that becomes a stop square while a reply
 * streams in. It takes nothing — everything it needs is on the composer.
 */
export function ComposerSend({ testID }: ComposerSendProps) {
  const { canSend, labels, streaming } = useComposerState('Composer.Send');
  const { send, stop } = useComposerActions('Composer.Send');
  const isStopping = streaming && stop !== undefined;
  const isActive = isStopping || canSend;
  const Icon = isStopping ? SquareIcon : ArrowUpIcon;

  const handlePress = () => {
    if (isStopping) {
      stop?.();
      return;
    }

    // The button is already disabled when there is nothing to send. This is the
    // belt to that pair of braces, and it is why the rule lives here rather than
    // in the root's `send` action, which must stay free of anything derived from
    // `value`.
    if (canSend) {
      send();
    }
  };

  return (
    // Tinted glass rather than a second variant: on iOS 26 the active send
    // button is the same material as the rest, just carrying the accent.
    <ComposerAction
      accessibilityLabel={isStopping ? labels.stop : labels.send}
      className={isActive ? 'bg-primary' : undefined}
      disabled={!isActive}
      onPress={handlePress}
      style={sendStyle}
      testID={testID}
    >
      <Icon
        className={cn(
          isActive ? 'text-primary-foreground' : 'text-muted-foreground',
          isStopping ? 'size-4' : 'size-6',
        )}
      />
    </ComposerAction>
  );
}

ComposerSend.displayName = 'Composer.Send';
