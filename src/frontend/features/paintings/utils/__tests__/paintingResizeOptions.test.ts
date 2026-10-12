import { paintingResizeOptions } from '../paintingResizeOptions';

describe('painting resize admission', () => {
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
