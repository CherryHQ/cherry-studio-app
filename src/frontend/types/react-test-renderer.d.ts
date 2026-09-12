declare module 'react-test-renderer' {
  import type { ReactElement } from 'react';

  export type ReactTestInstance = {
    /** Rendered children in order; text arrives as a bare string, not a node. */
    children: (ReactTestInstance | string)[];
    /** `null` at the root, and for a node whose parents are all host-less. */
    parent: ReactTestInstance | null;
    props: Record<string, any>;
    type: unknown;
    find: (predicate: (node: ReactTestInstance) => boolean) => ReactTestInstance;
    findAll: (predicate: (node: ReactTestInstance) => boolean) => ReactTestInstance[];
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
