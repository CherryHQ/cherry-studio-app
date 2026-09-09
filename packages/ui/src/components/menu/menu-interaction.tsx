import { createContext, use } from 'react';
import type { View } from 'react-native';

export type MenuInteractionValue = {
  isOpen: boolean;
  close: (afterClose?: () => void) => void;
  registerItem?: (item: View) => () => void;
};

export const MenuInteraction = createContext<MenuInteractionValue | null>(null);

export function useMenuInteraction() {
  const interaction = use(MenuInteraction);
  if (!interaction) {
    throw new Error('Menu items must be rendered inside a menu');
  }
  return interaction;
}
