import { officeDiagnostic } from '../officeDiagnostics';

it('preserves the failure stage and cause while bounding bridge payloads', () => {
  const error = new Error('x'.repeat(3000));
  error.name = 'y'.repeat(200);
  error.stack = 'z'.repeat(6000);
  const diagnostic = officeDiagnostic('xlsx-parse', error);
  expect(diagnostic.stage).toBe('xlsx-parse');
  expect(diagnostic.name).toHaveLength(100);
  expect(diagnostic.message).toHaveLength(2000);
  expect(diagnostic.stack).toHaveLength(4000);
  expect(officeDiagnostic('pptx-node', 'unsupported shape')).toEqual({
    stage: 'pptx-node',
    name: 'Error',
    message: 'unsupported shape',
    stack: '',
  });
});
