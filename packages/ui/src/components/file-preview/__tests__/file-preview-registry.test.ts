import type { FilePreviewComponent } from '../file-preview.types';
import {
  createFilePreviewRegistry,
  extendFilePreviewRegistry,
} from '../utils/file-preview-registry';

const Fallback: FilePreviewComponent = () => null;
const ImageRenderer: FilePreviewComponent = () => null;
const PdfRenderer: FilePreviewComponent = () => null;
const CompactImageRenderer: FilePreviewComponent = () => null;

describe('file preview registry', () => {
  it('falls back to the platform renderer for a kind no plugin claims', () => {
    const registry = createFilePreviewRegistry(
      [{ component: ImageRenderer, kind: 'image' }],
      Fallback,
    );

    expect(registry.resolve('image')).toBe(ImageRenderer);
    expect(registry.resolve('pdf')).toBe(Fallback);
    expect(registry.resolve('application/vnd.cherry.unknown')).toBe(Fallback);
  });

  it('keeps the last plugin registered for a repeated kind', () => {
    const registry = createFilePreviewRegistry(
      [
        { component: ImageRenderer, kind: 'image' },
        { component: CompactImageRenderer, kind: 'image' },
      ],
      Fallback,
    );

    expect(registry.resolve('image')).toBe(CompactImageRenderer);
  });

  it('layers an extension over the kinds and fallback it does not name', () => {
    const base = createFilePreviewRegistry([{ component: ImageRenderer, kind: 'image' }], Fallback);

    const extended = extendFilePreviewRegistry(base, [
      { component: CompactImageRenderer, kind: 'image' },
      { component: PdfRenderer, kind: 'pdf' },
    ]);

    expect(extended.resolve('image')).toBe(CompactImageRenderer);
    expect(extended.resolve('pdf')).toBe(PdfRenderer);
    expect(extended.resolve('text')).toBe(Fallback);
    expect(base.resolve('image')).toBe(ImageRenderer);
  });
});
