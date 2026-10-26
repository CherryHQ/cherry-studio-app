import { createContext, use } from 'react';
import type { ViewInstance } from 'react-native';

export type AnswerFrame = Readonly<{ height: number; left: number; top: number; width: number }>;

export type ExpandAnswerRequest = Readonly<{
  /** The answer to open, which becomes the one shown. */
  id: string;
  /** Where an answer's card is on screen now, if it is mounted. */
  measure: (id: string) => Promise<AnswerFrame | undefined>;
  /** Showing an answer the row does not show yet; `false` once it could not be shown. */
  selection?: Promise<boolean>;
}>;

const ExpandAnswerContext = createContext<((request: ExpandAnswerRequest) => void) | null>(null);

export const ExpandAnswerContextProvider = ExpandAnswerContext.Provider;

/** A mounted view's frame in the window; absent once it is gone or has no size. */
export function measureFrame(
  view: ViewInstance | null | undefined,
): Promise<AnswerFrame | undefined> {
  return new Promise((resolve) => {
    if (!view) resolve(undefined);
    else
      view.measureInWindow((left, top, width, height) =>
        resolve(width > 0 && height > 0 ? { height, left, top, width } : undefined),
      );
  });
}

/** Opens an answer over the whole screen; absent where nothing can host it. */
export function useExpandAnswer() {
  return use(ExpandAnswerContext);
}
