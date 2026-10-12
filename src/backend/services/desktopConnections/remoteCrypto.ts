import { createNativeNoiseCrypto, type NativeCrypto } from '@cherrystudio/remote-transport';
import { Buffer, createHash, createCipheriv, createDecipheriv } from 'react-native-quick-crypto';

const native: NativeCrypto = {
  createHash,
  createCipheriv(algorithm, key, nonce, options) {
    const cipher = createCipheriv(algorithm, Buffer.from(key), Buffer.from(nonce), options);
    return {
      setAAD: (bytes) => cipher.setAAD(Buffer.from(bytes)),
      update: (bytes) => cipher.update(Buffer.from(bytes)),
      final: () => cipher.final(),
      getAuthTag: () => cipher.getAuthTag(),
    };
  },
  createDecipheriv(algorithm, key, nonce, options) {
    const cipher = createDecipheriv(algorithm, Buffer.from(key), Buffer.from(nonce), options);
    return {
      setAAD: (bytes) => cipher.setAAD(Buffer.from(bytes)),
      setAuthTag: (bytes) => cipher.setAuthTag(Buffer.from(bytes)),
      update: (bytes) => cipher.update(Buffer.from(bytes)),
      final: () => cipher.final(),
    };
  },
};
export const remoteCrypto = createNativeNoiseCrypto(native);
