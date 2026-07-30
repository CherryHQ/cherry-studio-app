import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { cacheService } from '@/frontend/data/CacheService';

import { useCache, usePersistCache } from '../useCache';

const MEMORY_KEY = 'internal.memory_probe.frontend' as const;

type CacheSetter = (value: string | ((prev: string) => string)) => void;

function CacheProbe({
  onSetter,
  initValue,
}: {
  onSetter?: (setter: CacheSetter) => void;
  initValue?: string;
}) {
  const [value, setValue] = useCache(MEMORY_KEY, initValue);
  onSetter?.(setValue);
  return <Text testID="value">{value}</Text>;
}

function PersistProbe({ onSetter }: { onSetter?: (setter: (value: number) => void) => void }) {
  const [value, setValue] = usePersistCache('internal.persist_probe');
  onSetter?.(setValue);
  return <Text testID="value">{String(value)}</Text>;
}

function renderedValue(renderer: ReactTestRenderer): string {
  return renderer.root.findByProps({ testID: 'value' }).props.children;
}

afterEach(() => {
  cacheService.cleanup();
});

describe('useCache', () => {
  test('returns the schema default and materializes it into the cache', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<CacheProbe />);
    });

    expect(renderedValue(renderer)).toBe('');
    expect(cacheService.has(MEMORY_KEY)).toBe(true);

    act(() => renderer.unmount());
  });

  test('initValue takes precedence over the schema default', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<CacheProbe initValue="seed" />);
    });

    expect(renderedValue(renderer)).toBe('seed');
    expect(cacheService.get(MEMORY_KEY)).toBe('seed');

    act(() => renderer.unmount());
  });

  test('setter updates every mounted consumer of the key', () => {
    let setter!: CacheSetter;
    let a!: ReactTestRenderer;
    let b!: ReactTestRenderer;
    act(() => {
      a = create(
        <CacheProbe
          onSetter={(s) => {
            setter = s;
          }}
        />,
      );
      b = create(<CacheProbe />);
    });

    act(() => setter('key-2'));

    expect(renderedValue(a)).toBe('key-2');
    expect(renderedValue(b)).toBe('key-2');

    act(() => {
      a.unmount();
      b.unmount();
    });
  });

  test('imperative cacheService.set re-renders the hook', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<CacheProbe />);
    });

    act(() => cacheService.set(MEMORY_KEY, 'external'));
    expect(renderedValue(renderer)).toBe('external');

    act(() => renderer.unmount());
  });

  test('functional updater resolves against the latest stored value', () => {
    let setter!: CacheSetter;
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <CacheProbe
          onSetter={(s) => {
            setter = s;
          }}
        />,
      );
    });

    act(() => cacheService.set(MEMORY_KEY, 'base'));
    act(() => setter((prev) => `${prev}+next`));
    expect(renderedValue(renderer)).toBe('base+next');

    act(() => renderer.unmount());
  });

  test('a mounted hook pins the key against deletion', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<CacheProbe />);
    });

    expect(cacheService.delete(MEMORY_KEY)).toBe(false);

    act(() => renderer.unmount());
    expect(cacheService.delete(MEMORY_KEY)).toBe(true);
  });
});

describe('usePersistCache', () => {
  test('returns the schema default and writes through on set', () => {
    let setter!: (value: number) => void;
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <PersistProbe
          onSetter={(s) => {
            setter = s;
          }}
        />,
      );
    });

    expect(renderedValue(renderer)).toBe('0');
    expect(cacheService.hasPersist('internal.persist_probe')).toBe(false);

    act(() => setter(42));
    expect(renderedValue(renderer)).toBe('42');
    expect(cacheService.getPersist('internal.persist_probe')).toBe(42);
    expect(cacheService.hasPersist('internal.persist_probe')).toBe(true);

    act(() => renderer.unmount());
  });

  test('imperative deletePersist resets the hook to the default', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<PersistProbe />);
    });

    act(() => cacheService.setPersist('internal.persist_probe', 7));
    expect(renderedValue(renderer)).toBe('7');

    act(() => cacheService.deletePersist('internal.persist_probe'));
    expect(renderedValue(renderer)).toBe('0');

    act(() => renderer.unmount());
  });
});
