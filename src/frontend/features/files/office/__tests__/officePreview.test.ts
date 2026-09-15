import { INITIAL_OFFICE_STATUS, mergeOfficeStatus, type OfficeStatus } from '../officePreview';

it('keeps worksheet and zoom when an image reports a late warning', () => {
  const previous: OfficeStatus = {
    ...INITIAL_OFFICE_STATUS,
    phase: 'ready',
    sheets: ['A', 'B'],
    sheet: 1,
    zoom: 150,
  };
  const incoming = { ...previous, sheet: 0, zoom: 100, warning: true };
  expect(mergeOfficeStatus(previous, incoming, 'xlsx')).toMatchObject({
    sheet: 1,
    zoom: 150,
    warning: true,
  });
});

it('accepts the browser-owned page and zoom for slides', () => {
  const incoming = { ...INITIAL_OFFICE_STATUS, page: 4, pages: 8, zoom: 120 };
  expect(mergeOfficeStatus(INITIAL_OFFICE_STATUS, incoming, 'pptx')).toBe(incoming);
});

it('ends busy work on error and ignores late ready callbacks until a fresh attempt', () => {
  const failure: OfficeStatus = {
    ...INITIAL_OFFICE_STATUS,
    busy: true,
    phase: 'error',
    error: 'failed',
  };
  const failed = mergeOfficeStatus(INITIAL_OFFICE_STATUS, failure, 'docx');
  expect(failed.busy).toBe(false);
  expect(mergeOfficeStatus(failed, { ...INITIAL_OFFICE_STATUS, phase: 'ready' }, 'docx')).toBe(
    failed,
  );
});
