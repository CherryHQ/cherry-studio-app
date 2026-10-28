import { resolveSidebarHeaderTop } from '../useSidebarHeaderTop';

jest.mock('@/frontend/appShell/layout', () => ({ useChatHeaderHeight: () => 0 }));

// Values measured on simulators; the chat header's controls center at the listed heights.
describe('resolveSidebarHeaderTop', () => {
  test.each([
    ['an iPhone', 62, 100.67, 70],
    ['an iPad', 24, 74, 32],
    ['before any chat header has laid out', 62, 0, 70],
  ])('keeps the title row below the top safe area on %s', (_name, top, header, rowTop) => {
    expect(resolveSidebarHeaderTop(top, header)).toBe(rowTop);
  });

  test.each([
    ['upright, where the header fills the top inset', 82],
    ['on its side, where the top inset is zero', 0],
  ])('centers the row on the header controls of an iPhone Duo inner display %s', (_name, top) => {
    // Controls center at 48 in an 82-point header; the 40-point row starts 20 above that.
    expect(resolveSidebarHeaderTop(top, 82)).toBe(28);
  });
});
