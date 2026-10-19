import type { ResolvedFile } from '@/shared/contracts';
import type { Painting } from '@/shared/data/types/painting';

import { paintingBoardCoverCells } from '../paintingBoardCover';

const painting = (id: string): Painting => ({
  boardId: 'board',
  brief: null,
  createdAt: '2026-10-19T00:00:00.000Z',
  files: { input: [], output: [] },
  id,
  modelId: null,
  orderKey: id,
  prompt: 'prompt',
  providerId: 'provider',
  updatedAt: '2026-10-19T00:00:00.000Z',
});
const output = (id: string) => ({ entry: { id }, uri: `file:///${id}.png` }) as ResolvedFile;

describe('paintingBoardCoverCells', () => {
  it('leads with a running generation, then fills from newest images, three at most', () => {
    const outputs = new Map([
      ['done', [output('a'), output('b')]],
      ['older', [output('c'), output('d')]],
    ]);

    expect(
      paintingBoardCoverCells(
        [painting('running'), painting('done'), painting('older')],
        outputs,
        new Set(['running']),
      ),
    ).toEqual([
      { key: 'running:generating', kind: 'generating' },
      { key: 'done:a', kind: 'image', uri: 'file:///a.png' },
      { key: 'done:b', kind: 'image', uri: 'file:///b.png' },
    ]);
  });

  it('skips receipts that stopped without images instead of leaving holes', () => {
    expect(
      paintingBoardCoverCells(
        [painting('stopped'), painting('done')],
        new Map([['done', [output('a')]]]),
        new Set(),
      ),
    ).toEqual([{ key: 'done:a', kind: 'image', uri: 'file:///a.png' }]);
  });
});
