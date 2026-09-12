import { DependencyResolver } from '../DependencyResolver';
import { CircularDependencyError, type DependencyNode, Phase } from '../types';

const node = (
  name: string,
  dependencies: string[] = [],
  overrides: Partial<DependencyNode> = {},
): DependencyNode => ({
  dependencies,
  name,
  phase: Phase.Gate,
  priority: 100,
  ...overrides,
});

describe('DependencyResolver.resolveLayered', () => {
  it('places a dependency in an earlier layer than its dependent', () => {
    const layers = new DependencyResolver().resolveLayered([
      node('Chat', ['Db']),
      node('Db'),
      node('Jobs', ['Db']),
    ]);

    expect(layers).toEqual([['Db'], expect.arrayContaining(['Chat', 'Jobs'])]);
    expect(layers[1]).toHaveLength(2);
  });

  it('orders peers within a layer by priority', () => {
    const layers = new DependencyResolver().resolveLayered([
      node('Late', [], { priority: 200 }),
      node('Early', [], { priority: 10 }),
      node('Default', []),
    ]);

    expect(layers).toEqual([['Early', 'Default', 'Late']]);
  });

  it('ignores dependencies outside the node set', () => {
    // A gate service already initialized in an earlier phase imposes no
    // ordering on the phase being resolved.
    const layers = new DependencyResolver().resolveLayered([
      node('PostReadyOnly', ['GateService']),
    ]);

    expect(layers).toEqual([['PostReadyOnly']]);
  });

  it('reports the cycle rather than looping forever', () => {
    const resolve = () =>
      new DependencyResolver().resolveLayered([
        node('A', ['C']),
        node('B', ['A']),
        node('C', ['B']),
      ]);

    expect(resolve).toThrow(CircularDependencyError);
    try {
      resolve();
    } catch (error) {
      // The message must name the participants; "a cycle exists" is not
      // actionable at 2am.
      expect((error as CircularDependencyError).cycle.length).toBeGreaterThan(1);
      expect((error as CircularDependencyError).message).toContain('A');
    }
  });

  it('detects a service depending on itself', () => {
    expect(() => new DependencyResolver().resolveLayered([node('Selfish', ['Selfish'])])).toThrow(
      CircularDependencyError,
    );
  });
});

describe('DependencyResolver.hoistGateDependencies', () => {
  it('promotes a post-ready service that a gate service depends on', () => {
    const nodes = [node('Gate', ['Late']), node('Late', [], { phase: Phase.PostReady })];

    const adjustments = new DependencyResolver().hoistGateDependencies(nodes);

    expect(adjustments).toEqual([
      {
        from: Phase.PostReady,
        reason: expect.stringContaining('Gate'),
        serviceName: 'Late',
        to: Phase.Gate,
      },
    ]);
    expect(nodes[1]?.phase).toBe(Phase.Gate);
  });

  it('promotes transitively', () => {
    const nodes = [
      node('Gate', ['Middle']),
      node('Middle', ['Deep'], { phase: Phase.PostReady }),
      node('Deep', [], { phase: Phase.PostReady }),
    ];

    new DependencyResolver().hoistGateDependencies(nodes);

    expect(nodes.map((n) => n.phase)).toEqual([Phase.Gate, Phase.Gate, Phase.Gate]);
  });

  it('leaves a post-ready service alone when only post-ready services need it', () => {
    const nodes = [
      node('LateConsumer', ['LateDependency'], { phase: Phase.PostReady }),
      node('LateDependency', [], { phase: Phase.PostReady }),
    ];

    expect(new DependencyResolver().hoistGateDependencies(nodes)).toEqual([]);
    expect(nodes.every((n) => n.phase === Phase.PostReady)).toBe(true);
  });

  it('never demotes a gate service to keep it with its dependency', () => {
    // Desktop adjusts the dependent; doing that here would silently stop a gate
    // service from blocking the gate it was declared to block.
    const nodes = [node('Gate', ['Late']), node('Late', [], { phase: Phase.PostReady })];

    new DependencyResolver().hoistGateDependencies(nodes);

    expect(nodes[0]?.phase).toBe(Phase.Gate);
  });
});
