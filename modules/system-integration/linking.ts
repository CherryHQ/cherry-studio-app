import { requireOptionalNativeModule } from 'expo';

interface LinkingModule {
  consumeURL?(expected: string): Promise<void>;
}

const retirements = new Set<Promise<void>>();

/** Expo Linking compares both stores on the platform's main queue. Older binaries lack the method. */
export async function retireNativeUrl(url: string): Promise<void> {
  const native = requireOptionalNativeModule<LinkingModule>('ExpoLinking');
  const retirement = native?.consumeURL?.(url);
  if (!retirement) return;
  retirements.add(retirement);
  try {
    await retirement;
  } finally {
    retirements.delete(retirement);
  }
}

/** Discard queued links and finish their native acknowledgements before restarting JavaScript. */
export async function reloadAfterNativeUrlRetirements(
  discardQueued: () => void,
  reload: () => Promise<void>,
): Promise<void> {
  for (;;) {
    discardQueued();
    if (!retirements.size) return reload();
    await Promise.allSettled(retirements);
  }
}
