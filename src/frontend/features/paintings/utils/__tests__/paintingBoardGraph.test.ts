import type { Painting } from '@/shared/data/types/painting';

import {
  buildPaintingBoardGraph,
  importNodeId,
  layoutPaintingBoard,
  paintingNodeChildren,
  paintingNodeId,
  paintingNodeParents,
} from '../paintingBoardGraph';

function painting(id: string, input: string[], output: string[]): Painting {
  return {
    boardId: 'board',
    brief: null,
    createdAt: '2026-10-15T00:00:00.000Z',
    files: { input, output },
    id,
    modelId: null,
    orderKey: id,
    prompt: id,
    providerId: 'provider',
    updatedAt: '2026-10-15T00:00:00.000Z',
  };
}

const metrics = { columnGap: 10, nodeHeight: 100, nodeWidth: 50, rowGap: 20 };

describe('paintingBoardGraph', () => {
  // root → (sunset, snow); sunset + photo → merged; sunset → pending
  const paintings = [
    painting('root', [], ['root-out']),
    painting('sunset', ['root-out'], ['sunset-out']),
    painting('snow', ['root-out'], ['snow-out']),
    painting('merged', ['sunset-out', 'photo'], ['merged-a', 'merged-b']),
    painting('pending', ['sunset-out'], []),
  ];

  it('derives edges from shared files and turns outside images into import nodes', () => {
    const graph = buildPaintingBoardGraph(paintings);

    expect(graph.nodes.map((node) => node.id)).toEqual([
      paintingNodeId('root'),
      paintingNodeId('sunset'),
      paintingNodeId('snow'),
      importNodeId('photo'),
      paintingNodeId('merged'),
      paintingNodeId('pending'),
    ]);
    expect(paintingNodeParents(graph, paintingNodeId('merged'))).toEqual([
      paintingNodeId('sunset'),
      importNodeId('photo'),
    ]);
    expect(paintingNodeChildren(graph, paintingNodeId('sunset'))).toEqual([
      paintingNodeId('merged'),
      paintingNodeId('pending'),
    ]);
    expect(paintingNodeParents(graph, paintingNodeId('root'))).toEqual([]);
    expect(graph.outputOwners.get('merged-b')).toBe('merged');
  });

  it('treats a painting reusing its own output and a repeated input as a single edge', () => {
    const graph = buildPaintingBoardGraph([
      painting('root', [], ['root-out']),
      painting('again', ['root-out', 'root-out'], ['again-out']),
    ]);

    expect(graph.edges).toEqual([{ from: paintingNodeId('root'), to: paintingNodeId('again') }]);
  });

  it('lays generations out top to bottom with imports above their first consumer', () => {
    const layout = layoutPaintingBoard(buildPaintingBoardGraph(paintings), metrics);
    const row = (id: string) => layout.nodes.get(id)!.y / (metrics.nodeHeight + metrics.rowGap);

    expect(row(paintingNodeId('root'))).toBe(0);
    expect(row(paintingNodeId('sunset'))).toBe(1);
    expect(row(paintingNodeId('snow'))).toBe(1);
    expect(row(importNodeId('photo'))).toBe(1);
    expect(row(paintingNodeId('merged'))).toBe(2);
    expect(row(paintingNodeId('pending'))).toBe(2);
    // Widest row has three nodes.
    expect(layout.width).toBe(170);
    expect(layout.height).toBe(340);
    // Children of `sunset` stay to the left of the `snow` branch.
    expect(layout.nodes.get(paintingNodeId('sunset'))!.x).toBeLessThan(
      layout.nodes.get(paintingNodeId('snow'))!.x,
    );
  });

  it('pushes a first generation below a photo it started from', () => {
    const layout = layoutPaintingBoard(
      buildPaintingBoardGraph([painting('edit', ['photo'], ['edit-out'])]),
      metrics,
    );

    expect(layout.nodes.get(importNodeId('photo'))!.y).toBe(0);
    expect(layout.nodes.get(paintingNodeId('edit'))!.y).toBe(120);
    expect(layout.nodes.get(paintingNodeId('edit'))!.x).toBe(0);
  });

  it('centres narrower rows on the widest one', () => {
    const layout = layoutPaintingBoard(
      buildPaintingBoardGraph([
        painting('root', [], ['root-out']),
        painting('a', ['root-out'], ['a-out']),
        painting('b', ['root-out'], ['b-out']),
      ]),
      metrics,
    );

    expect(layout.nodes.get(paintingNodeId('root'))!.x).toBe(30);
    expect(layout.nodes.get(paintingNodeId('a'))!.x).toBe(0);
    expect(layout.nodes.get(paintingNodeId('b'))!.x).toBe(60);
  });
});
