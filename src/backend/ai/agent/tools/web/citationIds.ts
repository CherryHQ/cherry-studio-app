import { citeId, newCitePrefix as newPortableCitePrefix } from '@cherrystudio/ai-runtime/utils';
import * as Crypto from 'expo-crypto';

export { citeId };

export function newCitePrefix(): string {
  return newPortableCitePrefix(Crypto.randomUUID);
}
