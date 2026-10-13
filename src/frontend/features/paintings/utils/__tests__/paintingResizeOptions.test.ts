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
      { ratio: '1:1', paramValues: { size: '1024x1024' } },
      { ratio: '2:3', paramValues: { size: '1024x1536' } },
      { ratio: '3:2', paramValues: { size: '1536x1024' } },
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
    expect(options).toEqual([{ ratio: '1:1', paramValues: { size: '1024x1024' } }]);
    expect(paintingResizeOptions(undefined)).toEqual([]);
  });
});
