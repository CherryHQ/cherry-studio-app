import { loggerService } from '@logger';

import { CircularDependencyError, type DependencyNode, Phase } from './types';

const logger = loggerService.withContext('Lifecycle');

const DEFAULT_PRIORITY = 100;

export type PhaseAdjustment = {
  serviceName: string;
  from: Phase;
  to: Phase;
  reason: string;
};

/**
 * Resolves service initialization order.
 *
 * Ported from Cherry Desktop `src/main/core/lifecycle/DependencyResolver.ts`.
 * The layering algorithm (Kahn's, with priority ordering inside a layer) is
 * unchanged; the phase validation is rewritten because mobile has two phases
 * instead of Desktop's three and the correct repair runs the other way — see
 * `hoistGateDependencies`.
 *
 * Desktop's `getDependents`/`getDependencies` are not ported: they exist to
 * cascade single-service start/stop, and mobile only starts and stops whole
 * hosts.
 */
export class DependencyResolver {
  /**
   * Group services into layers that can initialize in parallel.
   *
   * Every service in layer N depends only on services in layers < N. Within a
   * layer, services are ordered by `@Priority` — which matters only for the
   * sequencing of their synchronous prologues, since the layer runs
   * concurrently.
   */
  resolveLayered(nodes: DependencyNode[]): string[][] {
    const nodeMap = new Map(nodes.map((node) => [node.name, node]));
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();

    for (const node of nodes) {
      inDegree.set(node.name, 0);
      dependents.set(node.name, []);
    }

    for (const node of nodes) {
      for (const dependency of node.dependencies) {
        // Dependencies outside this node set (a different phase, typically)
        // are already initialized and impose no ordering here.
        if (!nodeMap.has(dependency)) continue;
        dependents.get(dependency)?.push(node.name);
        inDegree.set(node.name, (inDegree.get(node.name) ?? 0) + 1);
      }
    }

    const layers: string[][] = [];
    let remaining = nodes.length;

    while (remaining > 0) {
      const layer: string[] = [];
      for (const [name, degree] of inDegree) {
        if (degree === 0) layer.push(name);
      }

      if (layer.length === 0) {
        throw new CircularDependencyError(this.findCycle(nodes));
      }

      this.sortByPriority(layer, nodeMap);
      layers.push(layer);

      for (const name of layer) {
        inDegree.set(name, -1);
        for (const dependent of dependents.get(name) ?? []) {
          inDegree.set(dependent, (inDegree.get(dependent) ?? 0) - 1);
        }
      }

      remaining -= layer.length;
    }

    return layers;
  }

  /**
   * Promote every `PostReady` service that a `Gate` service depends on.
   *
   * Desktop demotes the *dependent* to the later phase. That is wrong here:
   * `Gate` means "first paint needs this", so a `Gate` service demoted to
   * `PostReady` would silently stop blocking the gate it was declared to block.
   * Promoting the dependency preserves both the ordering and the intent.
   *
   * Mutates `nodes` and iterates to a fixed point so a chain of dependencies is
   * promoted in full. Returns what it changed so the caller can log it.
   */
  hoistGateDependencies(nodes: DependencyNode[]): PhaseAdjustment[] {
    const nodeMap = new Map(nodes.map((node) => [node.name, node]));
    const adjustments: PhaseAdjustment[] = [];

    let changed = true;
    while (changed) {
      changed = false;
      for (const node of nodes) {
        if (node.phase !== Phase.Gate) continue;

        for (const dependencyName of node.dependencies) {
          const dependency = nodeMap.get(dependencyName);
          if (!dependency || dependency.phase === Phase.Gate) continue;

          adjustments.push({
            serviceName: dependency.name,
            from: dependency.phase,
            to: Phase.Gate,
            reason: `required by gate service '${node.name}'`,
          });
          dependency.phase = Phase.Gate;
          changed = true;
        }
      }
    }

    for (const adjustment of adjustments) {
      logger.warn(
        `Service '${adjustment.serviceName}' declared ${adjustment.from} but is ${adjustment.reason}; promoted to ${adjustment.to}`,
      );
    }

    return adjustments;
  }

  private sortByPriority(names: string[], nodeMap: Map<string, DependencyNode>): void {
    names.sort((a, b) => {
      const priorityA = nodeMap.get(a)?.priority ?? DEFAULT_PRIORITY;
      const priorityB = nodeMap.get(b)?.priority ?? DEFAULT_PRIORITY;
      return priorityA - priorityB;
    });
  }

  /** Depth-first search for a cycle, used only to build the error message. */
  private findCycle(nodes: DependencyNode[]): string[] {
    const nodeMap = new Map(nodes.map((node) => [node.name, node]));
    const visited = new Set<string>();
    const stack = new Set<string>();

    const walk = (name: string, path: string[]): string[] | null => {
      if (stack.has(name)) {
        return [...path.slice(path.indexOf(name)), name];
      }
      if (visited.has(name)) return null;

      visited.add(name);
      stack.add(name);
      path.push(name);

      for (const dependency of nodeMap.get(name)?.dependencies ?? []) {
        if (!nodeMap.has(dependency)) continue;
        const cycle = walk(dependency, path);
        if (cycle) return cycle;
      }

      stack.delete(name);
      path.pop();
      return null;
    };

    for (const node of nodes) {
      const cycle = walk(node.name, []);
      if (cycle) return cycle;
    }

    return ['unknown cycle'];
  }
}
