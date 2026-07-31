import { distributeMasonryItems } from '../masonry';

describe('distributeMasonryItems', () => {
  it('places each output in the currently shorter independent column', () => {
    const items = [
      { aspectRatio: 1, id: 'square' },
      { aspectRatio: 0.5, id: 'tall' },
      { aspectRatio: 2, id: 'wide' },
      { aspectRatio: 1, id: 'last' },
    ];

    const [left, right] = distributeMasonryItems(items);

    expect(left.map((item) => item.id)).toEqual(['square', 'wide', 'last']);
    expect(right.map((item) => item.id)).toEqual(['tall']);
  });
});
