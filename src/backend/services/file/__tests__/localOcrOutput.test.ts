import { parseOcrFields } from '../localOcrOutput';

test('keeps exact field strings and rejects numeric coercion, missing keys and extra fields', () => {
  expect(
    parseOcrFields('{"id":"0012","amount":"12.00 USD","date":null}', ['id', 'amount', 'date']),
  ).toEqual({ id: '0012', amount: '12.00 USD', date: null });
  expect(parseOcrFields('{"id":""}', ['id'])).toEqual({ id: null });
  for (const raw of ['{"id":12}', '{}', '{"id":"0012","extra":"x"}', '{"id":'])
    expect(parseOcrFields(raw, ['id'])).toBeUndefined();
});
