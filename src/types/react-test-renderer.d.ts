declare module 'react-test-renderer' {
  import type { ReactElement } from 'react';

  export type ReactTestInstance = {
    props: Record<string, any>;
    findAllByProps: (props: Record<string, unknown>) => ReactTestInstance[];
    findAllByType: (type: unknown) => ReactTestInstance[];
    findByProps: (props: Record<string, unknown>) => ReactTestInstance;
    findByType: (type: unknown) => ReactTestInstance;
  };

  export type ReactTestRenderer = {
    root: ReactTestInstance;
    toJSON: () => unknown;
    unmount: () => void;
    update: (element: ReactElement) => void;
  };

  export function act<T>(callback: () => T | Promise<T>): Promise<Awaited<T>>;

  export function create(element: ReactElement): ReactTestRenderer;
}
