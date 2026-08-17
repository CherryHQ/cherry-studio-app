import { JobHandlerRegistry } from '../JobHandlerRegistry';

describe('JobHandlerRegistry', () => {
  it('assembles a deeply frozen production registry', () => {
    const registry = new JobHandlerRegistry(
      { generateImage: jest.fn() } as never,
      { startSession: jest.fn() } as never,
      {
        paintingPresenter: {
          clearOrphans: jest.fn(async () => 0),
          start: jest.fn(),
        },
        translate: (key: string) => key,
      } as never,
    );

    expect(registry.entries).toHaveLength(1);
    expect(Object.isFrozen(registry.entries)).toBe(true);
    expect(Object.isFrozen(registry.entries[0])).toBe(true);
    expect(Object.isFrozen(registry.entries[0]?.[1])).toBe(true);
    expect(registry.entries[0]?.[0]).toBe('painting.generate');
  });
});
