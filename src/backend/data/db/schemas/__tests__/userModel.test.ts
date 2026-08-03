import { REGISTRY_ENRICHABLE_FIELDS } from '../userModel';

jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
  v7: jest.fn(() => '00000000-0000-7000-8000-000000000000'),
}));

describe('user model schema', () => {
  test('recognizes group as a registry-enrichable field', () => {
    expect(REGISTRY_ENRICHABLE_FIELDS).toContain('group');
  });
});
