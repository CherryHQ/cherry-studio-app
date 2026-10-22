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

  it('lays generations out left to right with imports before their first consumer', () => {
    const layout = layoutPaintingBoard(buildPaintingBoardGraph(paintings), metrics);
    const column = (id: string) =>
      layout.nodes.get(id)!.x / (metrics.nodeWidth + metrics.columnGap);

    expect(column(paintingNodeId('root'))).toBe(0);
    expect(column(paintingNodeId('sunset'))).toBe(1);
    expect(column(paintingNodeId('snow'))).toBe(1);
    expect(column(importNodeId('photo'))).toBe(1);
    expect(column(paintingNodeId('merged'))).toBe(2);
    expect(column(paintingNodeId('pending'))).toBe(2);
    // Three columns; the tallest has three nodes.
    expect(layout.width).toBe(170);
    expect(layout.height).toBe(340);
    // Children of `sunset` stay above the `snow` branch.
    expect(layout.nodes.get(paintingNodeId('sunset'))!.y).toBeLessThan(
      layout.nodes.get(paintingNodeId('snow'))!.y,
    );
  });

  it('places a first generation after a photo it started from', () => {
    const layout = layoutPaintingBoard(
      buildPaintingBoardGraph([painting('edit', ['photo'], ['edit-out'])]),
      metrics,
    );

    expect(layout.nodes.get(importNodeId('photo'))!.x).toBe(0);
    expect(layout.nodes.get(paintingNodeId('edit'))!.x).toBe(60);
    expect(layout.nodes.get(paintingNodeId('edit'))!.y).toBe(0);
  });

  it('centres shorter columns on the tallest one', () => {
    const layout = layoutPaintingBoard(
      buildPaintingBoardGraph([
        painting('root', [], ['root-out']),
        painting('a', ['root-out'], ['a-out']),
        painting('b', ['root-out'], ['b-out']),
      ]),
      metrics,
    );

    expect(layout.nodes.get(paintingNodeId('root'))!.y).toBe(60);
    expect(layout.nodes.get(paintingNodeId('a'))!.y).toBe(0);
    expect(layout.nodes.get(paintingNodeId('b'))!.y).toBe(120);
  });
});
