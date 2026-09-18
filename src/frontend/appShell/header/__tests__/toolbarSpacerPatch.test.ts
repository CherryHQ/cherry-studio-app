import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

type HeaderItem = { type: 'custom'; element: null } | { type: 'spacing'; spacing: number };

const source = readFileSync(
  require.resolve('expo-router/build/react-navigation/native-stack/views/useHeaderConfigProps'),
  'utf8',
);

// Exercise the installed dependency's conversion without mounting a native header.
// Its imports are unused for custom views and spacers; glass rendering needs device acceptance.
const processBarButtonItems = runInNewContext(`${source}\nprocessBarButtonItems;`, {
  exports: {},
  require: () => ({}),
}) as (items: HeaderItem[]) => { type: 'spacing'; spacing: number; index: number }[];

describe('Expo Router toolbar spacer patch', () => {
  test.each([0, 4])('keeps a %i-point spacer between two custom header buttons', (spacing) => {
    const items: HeaderItem[] = [
      { type: 'custom', element: null },
      { type: 'spacing', spacing },
      { type: 'custom', element: null },
    ];

    expect(processBarButtonItems(items)).toEqual([{ type: 'spacing', spacing, index: 1 }]);
  });

  test('retains original positions when multiple custom groups are separated', () => {
    expect(
      processBarButtonItems([
        { type: 'custom', element: null },
        { type: 'spacing', spacing: 4 },
        { type: 'custom', element: null },
        { type: 'spacing', spacing: 8 },
        { type: 'custom', element: null },
      ]),
    ).toEqual([
      { type: 'spacing', spacing: 4, index: 1 },
      { type: 'spacing', spacing: 8, index: 3 },
    ]);
  });
});
