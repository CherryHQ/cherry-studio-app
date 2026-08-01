import type { Serializable } from './serializable';

/** Serialized error contract shared by persistence and transport boundaries. */
export interface SerializedError {
  name: string | null;
  message: string | null;
  stack: string | null;
  [key: string]: Serializable;
}
