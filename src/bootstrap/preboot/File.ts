import { Blob as ExpoBlob, type BlobPart } from 'expo-blob';

/** Web File backed by the same bytes as Expo Blob, rather than React Native's legacy Blob. */
export class File extends ExpoBlob {
  // Type-only: Metro's Babel rejects `declare` fields, and these are defined read-only below.
  readonly name!: string;
  readonly lastModified!: number;
  readonly webkitRelativePath = '';

  constructor(parts: Iterable<BlobPart>, name: string, options: FilePropertyBag = {}) {
    if (arguments.length < 2) throw new TypeError('File requires file parts and a name.');
    super(parts, options);
    const lastModified =
      options.lastModified === undefined ? Date.now() : Number(options.lastModified);
    Object.defineProperties(this, {
      name: { value: String(name), enumerable: true },
      lastModified: {
        value: Number.isFinite(lastModified) ? Math.trunc(lastModified) : 0,
        enumerable: true,
      },
    });
  }

  get [Symbol.toStringTag]() {
    return 'File';
  }

  override toString() {
    return '[object File]';
  }
}
