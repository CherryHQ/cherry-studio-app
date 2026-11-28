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

/** A profile reload re-reads native launch data, including previously abandoned deliveries. */
export async function waitForNativeUrlRetirements(): Promise<void> {
  while (retirements.size) await Promise.allSettled(retirements);
}
