import { resolvePaneSplit } from '../paneSplit';

// iPhone Duo's inner display measured in the Xcode 27.1 simulator: 951 × 669 landscape.
const landscape = { height: 669, width: 951 };
const upright = { height: 951, width: 669 };
const regular = { chatOffset: 400, direction: 'row', paneSize: 400 };

it('keeps the regular widths without a fold', () => {
  expect(resolvePaneSplit({ fold: null, host: landscape, paneWidth: 400 })).toEqual(regular);
});

it('meets a partly folded book at the fold, leaving the fold itself empty', () => {
  expect(
    resolvePaneSplit({
      fold: { height: 669, width: 40, x: 455, y: 0 },
      host: landscape,
      paneWidth: 400,
    }),
  ).toEqual({ chatOffset: 495, direction: 'row', paneSize: 455 });
});

it('stacks the pane above the chat on a fold across the window', () => {
  expect(
    resolvePaneSplit({
      fold: { height: 40, width: 669, x: 0, y: 455 },
      host: upright,
      paneWidth: 400,
    }),
  ).toEqual({ chatOffset: 495, direction: 'column', paneSize: 455 });
});

it('places the split at the fold in host points, beside a persistent sidebar', () => {
  expect(
    resolvePaneSplit({
      fold: { height: 669, width: 40, x: 475, y: 0 },
      host: { height: 669, width: 1000 },
      paneWidth: 400,
    }),
  ).toEqual({ chatOffset: 515, direction: 'row', paneSize: 475 });
});

it('ignores a fold outside the host, as Split View can leave it at the window edge', () => {
  expect(
    resolvePaneSplit({
      fold: { height: 669, width: 40, x: 0, y: 0 },
      host: { height: 669, width: 475 },
      paneWidth: 400,
    }),
  ).toEqual(regular);
});
