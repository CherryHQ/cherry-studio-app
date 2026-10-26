import { Blob as ExpoBlob } from 'expo-blob';

import { File } from './File';

globalThis.Blob = ExpoBlob as unknown as typeof globalThis.Blob;
globalThis.File = File as unknown as typeof globalThis.File;

// Expo's FormData patch mutates Blob.name and cannot override a readonly File.name. Normalize
// each entry into its own File before delegation, preserving bytes, type and per-entry filenames.
// Keep the original methods across repeated setup rather than stacking wrappers.
const ORIGINAL_METHODS = Symbol.for('cherry.formData.originalMethods');
type Methods = Pick<FormData, 'append' | 'set'>;
const prototype = FormData.prototype as FormData & { [ORIGINAL_METHODS]?: Methods };
const original = prototype[ORIGINAL_METHODS] ?? { append: prototype.append, set: prototype.set };
Object.defineProperty(prototype, ORIGINAL_METHODS, { value: original, configurable: true });

function normalizeEntry(args: unknown[]) {
  const value = args[1];
  if (args.length >= 2 && value instanceof ExpoBlob) {
    if (value instanceof File && args[2] === undefined) return [args[0], value];
    const name =
      args[2] !== undefined
        ? String(args[2])
        : 'name' in value && typeof value.name === 'string'
          ? value.name
          : 'blob';
    const lastModified =
      'lastModified' in value && typeof value.lastModified === 'number'
        ? value.lastModified
        : undefined;
    return [args[0], new File([value], name, { type: value.type, lastModified })];
  }
  return args;
}

prototype.append = function (...args) {
  return Reflect.apply(original.append, this, normalizeEntry(args));
};
prototype.set = function (...args) {
  return Reflect.apply(original.set, this, normalizeEntry(args));
};
