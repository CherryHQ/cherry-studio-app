import type { Painting } from '@/shared/data/types/painting';

/**
 * A board node is either one generation (a painting) or an image that entered
 * the board from outside — a photo the user attached — which has no generation
 * of its own. Edges are derived, never stored: within one board, a painting
 * that used another painting's output as input was made from it.
 */
export type PaintingBoardNodeRef =
  | { kind: 'painting'; id: string; paintingId: string }
  | { kind: 'import'; id: string; fileEntryId: string };

export type PaintingBoardEdge = { from: string; to: string };

export type PaintingBoardGraph = {
  edges: readonly PaintingBoardEdge[];
  nodes: readonly PaintingBoardNodeRef[];
  /** Painting id that produced each output file in this board. */
  outputOwners: ReadonlyMap<string, string>;
};

export function paintingNodeId(paintingId: string) {
  return `painting:${paintingId}`;
}

export function importNodeId(fileEntryId: string) {
  return `import:${fileEntryId}`;
}

/** Paintings must be in generation order (oldest first), as the board API returns them. */
export function buildPaintingBoardGraph(paintings: readonly Painting[]): PaintingBoardGraph {
  const outputOwners = new Map<string, string>();
  for (const painting of paintings) {
    for (const fileEntryId of painting.files.output) {
      if (!outputOwners.has(fileEntryId)) outputOwners.set(fileEntryId, painting.id);
    }
  }

  const nodes: PaintingBoardNodeRef[] = [];
  const imports = new Set<string>();
  const edges: PaintingBoardEdge[] = [];
  const edgeKeys = new Set<string>();
  for (const painting of paintings) {
    const to = paintingNodeId(painting.id);
    for (const fileEntryId of painting.files.input) {
      const owner = outputOwners.get(fileEntryId);
      let from: string;
      if (owner && owner !== painting.id) {
        from = paintingNodeId(owner);
      } else {
        from = importNodeId(fileEntryId);
        if (!imports.has(fileEntryId)) {
          imports.add(fileEntryId);
          nodes.push({ fileEntryId, id: from, kind: 'import' });
        }
      }
      const key = `${from}>${to}`;
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        edges.push({ from, to });
      }
    }
    nodes.push({ id: to, kind: 'painting', paintingId: painting.id });
  }

  return { edges, nodes, outputOwners };
}

export function paintingNodeParents(graph: PaintingBoardGraph, nodeId: string): string[] {
  return graph.edges.filter((edge) => edge.to === nodeId).map((edge) => edge.from);
}

export function paintingNodeChildren(graph: PaintingBoardGraph, nodeId: string): string[] {
  return graph.edges.filter((edge) => edge.from === nodeId).map((edge) => edge.to);
}

export type PaintingBoardLayoutNode = { id: string; x: number; y: number };

export type PaintingBoardLayout = {
  height: number;
  nodes: ReadonlyMap<string, PaintingBoardLayoutNode>;
  width: number;
};

export type PaintingBoardLayoutMetrics = {
  columnGap: number;
  nodeHeight: number;
  nodeWidth: number;
  rowGap: number;
};

/**
 * Left-to-right layered layout, reading like a timeline. A node sits one
 * column after its rightmost parent, and an imported image sits directly
 * before the first generation that used it. Within a column, nodes follow
 * their parents' vertical order and then generation order, so branches stay
 * beside the image they came from. Columns are centred on the tallest one;
 * positions are not stored.
 */
export function layoutPaintingBoard(
  graph: PaintingBoardGraph,
  metrics: PaintingBoardLayoutMetrics,
): PaintingBoardLayout {
  const order = new Map(graph.nodes.map((node, index) => [node.id, index]));
  const parents = new Map<string, string[]>();
  for (const edge of graph.edges) {
    parents.set(edge.to, [...(parents.get(edge.to) ?? []), edge.from]);
  }

  // Generations only: imports are placed relative to their consumers below.
  const generationDepth = new Map<string, number>();
  for (const node of graph.nodes) {
    if (node.kind !== 'painting') continue;
    const depths = (parents.get(node.id) ?? [])
      .filter((parent) => generationDepth.has(parent))
      .map((parent) => (generationDepth.get(parent) ?? 0) + 1);
    generationDepth.set(node.id, Math.max(0, ...depths));
  }
  const depth = new Map(generationDepth);
  for (const node of graph.nodes) {
    if (node.kind !== 'import') continue;
    const consumers = graph.edges.filter((edge) => edge.from === node.id).map((edge) => edge.to);
    const firstConsumerDepth = Math.min(
      ...consumers.map((consumer) => generationDepth.get(consumer) ?? 0),
    );
    depth.set(node.id, Math.max(0, firstConsumerDepth - 1));
  }
  // An import that could not move before a root pushes that root and its
  // descendants one column later; nodes are already in dependency order.
  for (const node of graph.nodes) {
    if (node.kind !== 'painting') continue;
    const minimum = Math.max(
      0,
      ...(parents.get(node.id) ?? []).map((parent) => (depth.get(parent) ?? 0) + 1),
    );
    if ((depth.get(node.id) ?? 0) < minimum) depth.set(node.id, minimum);
  }

  const columns: string[][] = [];
  for (const node of graph.nodes) {
    (columns[depth.get(node.id) ?? 0] ??= []).push(node.id);
  }

  const row = new Map<string, number>();
  for (const column of columns) {
    if (!column) continue;
    const anchor = (id: string) => {
      const placed = (parents.get(id) ?? []).filter((parent) => row.has(parent));
      // Imports have no parents and sort after the nodes that follow a branch.
      if (placed.length === 0) return Number.POSITIVE_INFINITY;
      return placed.reduce((sum, parent) => sum + (row.get(parent) ?? 0), 0) / placed.length;
    };
    column.sort(
      (left, right) =>
        anchor(left) - anchor(right) || (order.get(left) ?? 0) - (order.get(right) ?? 0),
    );
    column.forEach((id, index) => row.set(id, index));
  }

  const tallest = Math.max(1, ...columns.map((column) => column?.length ?? 0));
  const step = metrics.nodeHeight + metrics.rowGap;
  const height = tallest * metrics.nodeHeight + (tallest - 1) * metrics.rowGap;
  const nodes = new Map<string, PaintingBoardLayoutNode>();
  columns.forEach((column, columnIndex) => {
    if (!column) return;
    const columnHeight = column.length * metrics.nodeHeight + (column.length - 1) * metrics.rowGap;
    const offset = (height - columnHeight) / 2;
    column.forEach((id, index) => {
      nodes.set(id, {
        id,
        x: columnIndex * (metrics.nodeWidth + metrics.columnGap),
        y: offset + index * step,
      });
    });
  });
  const columnCount = columns.length;

  return {
    height,
    nodes,
    width: columnCount * metrics.nodeWidth + Math.max(0, columnCount - 1) * metrics.columnGap,
  };
}
