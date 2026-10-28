import { paintingResizeOptions } from '../paintingResizeOptions';

describe('painting resize admission', () => {
  it('shows registry-prefixed ratios while preserving their exact request values', () => {
    expect(
      paintingResizeOptions({
        mode: 'edit',
        definition: {
          supports: {
            aspectRatio: { type: 'enum', options: ['ASPECT_1_1', 'ASPECT_16_9', 'auto'] },
          },
        },
      }),
    ).toEqual([
      { ratio: '1:1', paramValues: { aspectRatio: 'ASPECT_1_1' } },
      { ratio: '16:9', paramValues: { aspectRatio: 'ASPECT_16_9' } },
    ]);
  });
  it('maps dimensions to a ratio without inventing an unsupported aspectRatio parameter', () => {
    const options = paintingResizeOptions({
      mode: 'edit',
      definition: {
        supports: {
          size: {
            type: 'enum',
            options: ['auto', '1024x1024', '1024x1536', '1536x1024'],
            default: '1024x1024',
          },
        },
      },
    });
    expect(options).toEqual([
      { ratio: '1:1', paramValues: { size: '1024x1024' }, pixels: '1024×1024' },
      { ratio: '2:3', paramValues: { size: '1024x1536' }, pixels: '1024×1536' },
      { ratio: '3:2', paramValues: { size: '1536x1024' }, pixels: '1536×1024' },
    ]);
  });

  it('reads vendor-rounded pixel sizes as their nominal ratio', () => {
    const options = paintingResizeOptions({
      mode: 'generate',
      definition: {
        supports: {
          size: {
            type: 'enum',
            options: ['1664x928', '1472x1140', '1328x1328', '1568x1056', '1296x3168'],
          },
        },
      },
    });
    expect(options.map(({ ratio, pixels }) => `${ratio} ${pixels}`)).toEqual([
      '16:9 1664×928',
      '4:3 1472×1140',
      '1:1 1328×1328',
      '3:2 1568×1056',
      '9:22 1296×3168',
    ]);
  });

  it('prefers a declared default when two resolutions have the same ratio', () => {
    const options = paintingResizeOptions({
      mode: 'edit',
      definition: {
        supports: {
          size: { type: 'enum', options: ['512x512', '1024x1024'], default: '1024x1024' },
        },
      },
    });
    expect(options).toEqual([
      { ratio: '1:1', paramValues: { size: '1024x1024' }, pixels: '1024×1024' },
    ]);
    expect(paintingResizeOptions(undefined)).toEqual([]);
  });
});
