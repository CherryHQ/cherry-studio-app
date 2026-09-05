import CirclePauseIcon from '@cherrystudio/app-icons/icons/circle-pause';
import SendIcon from '@cherrystudio/app-icons/icons/send';

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
  const Icon = isStopping ? CirclePauseIcon : SendIcon;

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
    <ComposerAction
      accessibilityLabel={isStopping ? labels.stop : labels.send}
      className="bg-transparent"
      disabled={!isActive}
      onPress={handlePress}
      style={sendStyle}
      testID={testID}
    >
      <Icon
        className={cn(
          isStopping
            ? 'size-5 text-destructive'
            : isActive
              ? 'size-[22px] text-primary'
              : 'size-[22px] text-foreground-disabled',
        )}
      />
    </ComposerAction>
  );
}

ComposerSend.displayName = 'Composer.Send';
