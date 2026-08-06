import { allSourceTypes } from '@cherrystudio/universal/data/types/file';

import { persistentFileRefTablesBySourceType } from '../fileRelations';

jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
  v7: jest.fn(() => '00000000-0000-7000-8000-000000000000'),
}));

describe('persistent file reference registry', () => {
  it('registers every FileRef source in one zero-reference source of truth', () => {
    expect(Object.keys(persistentFileRefTablesBySourceType).sort()).toEqual(
      [...allSourceTypes].sort(),
    );
  });
});
