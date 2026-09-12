import type { ResolvedPaintingFiles } from '@/frontend/data/paintings/usePaintings';
import type { Painting } from '@/shared/data/types/painting';

import { paintingOpenState } from '../paintingOpenState';

const painting: Painting = {
  createdAt: '2026-09-11T00:00:00.000Z',
  files: { input: [], output: ['file-1'] },
  id: 'painting-1',
  modelId: 'provider::model',
  orderKey: 'a',
  prompt: 'draw a cherry',
  providerId: 'provider',
  updatedAt: '2026-09-11T00:00:00.000Z',
};

const output: ResolvedPaintingFiles['outputs'][number] = {
  fileEntryId: 'file-1',
  id: 'painting-file:file-1',
  kind: 'image',
  mediaType: 'image/png',
  name: 'cherry.png',
  size: 1,
  status: 'ready',
  uri: 'file:///cherry.png',
};

const settled = {
  files: undefined,
  filesError: null,
  hasHandoff: false,
  isFilesLoading: false,
  isPaintingLoading: false,
  painting: undefined,
  paintingError: null,
} as const;

describe('paintingOpenState', () => {
  it('loads while either query is loading, even after an earlier error', () => {
    expect(
      paintingOpenState({ ...settled, isPaintingLoading: true, paintingError: new Error('x') }),
    ).toBe('loading');
    expect(paintingOpenState({ ...settled, painting, isFilesLoading: true })).toBe('loading');
  });

  it('distinguishes a painting that failed to load from one that is gone', () => {
    expect(paintingOpenState({ ...settled, paintingError: new Error('offline') })).toBe(
      'loadFailed',
    );
    expect(paintingOpenState(settled)).toBe('unavailable');
  });

  it('opens a handoff on the painting row alone', () => {
    expect(paintingOpenState({ ...settled, painting, hasHandoff: true })).toBe('ready');
  });

  it('waits for resolved files and reports their failure', () => {
    expect(paintingOpenState({ ...settled, painting })).toBe('loading');
    expect(paintingOpenState({ ...settled, painting, filesError: new Error('disk') })).toBe(
      'loadFailed',
    );
  });

  it('treats a painting whose outputs no longer resolve as unavailable', () => {
    expect(paintingOpenState({ ...settled, painting, files: { inputs: [], outputs: [] } })).toBe(
      'unavailable',
    );
    expect(
      paintingOpenState({ ...settled, painting, files: { inputs: [], outputs: [output] } }),
    ).toBe('ready');
  });

  it('keeps loaded data open when a refetch fails', () => {
    expect(
      paintingOpenState({
        ...settled,
        files: { inputs: [], outputs: [output] },
        filesError: new Error('stale'),
        painting,
        paintingError: new Error('stale'),
      }),
    ).toBe('ready');
  });
});
