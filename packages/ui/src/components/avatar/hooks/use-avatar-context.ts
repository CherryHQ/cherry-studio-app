import { createContext, use } from 'react';

type AvatarContextValue = {
  borderRadius: number;
  size: number;
};

export const AvatarContext = createContext<AvatarContextValue | null>(null);

export function useAvatarContext(componentName: string) {
  const context = use(AvatarContext);

  if (!context) {
    throw new Error(`${componentName} must be used inside <Avatar>.`);
  }

  return context;
}
