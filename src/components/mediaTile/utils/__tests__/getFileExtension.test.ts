import { getFileBaseName, getFileExtension } from '../getFileExtension';

describe('getFileExtension', () => {
  test('extracts compact file extensions', () => {
    expect(getFileExtension('report.pdf')).toBe('PDF');
    expect(getFileExtension('archive.longextension')).toBe('LONGE');
    expect(getFileExtension('README')).toBe('');
  });
});

describe('getFileBaseName', () => {
  test('strips the extension', () => {
    expect(getFileBaseName('report.pdf')).toBe('report');
    expect(getFileBaseName('archive.longextension')).toBe('archive');
  });

  test('returns the name unchanged when there is no extension', () => {
    expect(getFileBaseName('README')).toBe('README');
    expect(getFileBaseName('.gitignore')).toBe('.gitignore');
  });
});
