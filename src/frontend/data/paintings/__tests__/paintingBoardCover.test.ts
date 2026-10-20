import type { ResolvedFile } from '@/shared/contracts';
import type { Painting } from '@/shared/data/types/painting';

import { paintingBoardCover } from '../paintingBoardCover';

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

describe('paintingBoardCover', () => {
  it('leads with a running generation, then fills from newest images, four at most', () => {
    const outputs = new Map([
      ['done', [output('a'), output('b')]],
      ['older', [output('c'), output('d')]],
    ]);

    expect(
      paintingBoardCover(
        [painting('running'), painting('done'), painting('older')],
        outputs,
        new Set(['running']),
        9,
      ),
    ).toEqual({
      cells: [
        { key: 'running:generating', kind: 'generating' },
        { key: 'done:a', kind: 'image', uri: 'file:///a.png' },
        { key: 'done:b', kind: 'image', uri: 'file:///b.png' },
        { key: 'older:c', kind: 'image', uri: 'file:///c.png' },
      ],
      // Nine images plus the running generation, less the three cells before the counter.
      moreCount: 7,
    });
  });

  it('counts nothing more until the cover reaches its fourth cell', () => {
    expect(
      paintingBoardCover(
        [painting('done'), painting('older')],
        new Map([
          ['done', [output('a'), output('b')]],
          ['older', [output('c')]],
        ]),
        new Set(),
        3,
      ).moreCount,
    ).toBe(0);
  });

  it('skips receipts that stopped without images instead of leaving holes', () => {
    expect(
      paintingBoardCover(
        [painting('stopped'), painting('done')],
        new Map([['done', [output('a')]]]),
        new Set(),
        1,
      ),
    ).toEqual({ cells: [{ key: 'done:a', kind: 'image', uri: 'file:///a.png' }], moreCount: 0 });
  });
});
