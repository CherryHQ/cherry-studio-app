import { resolvePaneSplit } from '../paneSplit';

// iPhone Duo's inner display measured in the Xcode 27.1 simulator: 951 × 669 landscape.
const landscape = { height: 669, width: 951, x: 0, y: 0 };
const upright = { height: 951, width: 669, x: 0, y: 0 };
const regular = { chatOffset: 400, direction: 'row', paneSize: 400 };

it('keeps the regular widths without a fold or on a flat fold down the window', () => {
  expect(resolvePaneSplit({ fold: null, host: landscape, paneWidth: 400 })).toEqual(regular);
  expect(
    resolvePaneSplit({
      fold: { height: 669, isActive: false, width: 0, x: 475, y: 0 },
      host: landscape,
      paneWidth: 400,
    }),
  ).toEqual(regular);
});

it('meets a partly folded book at the fold, leaving the fold itself empty', () => {
  expect(
    resolvePaneSplit({
      fold: { height: 669, isActive: true, width: 40, x: 455, y: 0 },
      host: landscape,
      paneWidth: 400,
    }),
  ).toEqual({ chatOffset: 495, direction: 'row', paneSize: 455 });
});

it('stacks the pane above the chat on a fold across the window, folded or flat', () => {
  expect(
    resolvePaneSplit({
      fold: { height: 0, isActive: false, width: 669, x: 0, y: 475 },
      host: upright,
      paneWidth: 400,
    }),
  ).toEqual({ chatOffset: 475, direction: 'column', paneSize: 475 });
  expect(
    resolvePaneSplit({
      fold: { height: 40, isActive: true, width: 669, x: 0, y: 455 },
      host: upright,
      paneWidth: 400,
    }),
  ).toEqual({ chatOffset: 495, direction: 'column', paneSize: 455 });
});

it('measures the fold from the host, which a persistent sidebar moves', () => {
  expect(
    resolvePaneSplit({
      fold: { height: 669, isActive: true, width: 40, x: 755, y: 0 },
      host: { height: 669, width: 1000, x: 280, y: 0 },
      paneWidth: 400,
    }),
  ).toEqual({ chatOffset: 515, direction: 'row', paneSize: 475 });
});

it('ignores a fold outside the host, as Split View can leave it at the window edge', () => {
  expect(
    resolvePaneSplit({
      fold: { height: 669, isActive: true, width: 40, x: 0, y: 0 },
      host: { height: 669, width: 475, x: 0, y: 0 },
      paneWidth: 400,
    }),
  ).toEqual(regular);
});
