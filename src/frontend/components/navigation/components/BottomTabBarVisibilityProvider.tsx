import {
  createContext,
  type Dispatch,
  type PropsWithChildren,
  type SetStateAction,
  use,
  useState,
} from 'react';

const BottomTabBarHiddenContext = createContext<boolean | null>(null);
const SetBottomTabBarHiddenContext = createContext<Dispatch<SetStateAction<boolean>> | null>(null);

export function BottomTabBarVisibilityProvider({ children }: PropsWithChildren) {
  const [isBottomTabBarHidden, setIsBottomTabBarHidden] = useState(false);

  return (
    <SetBottomTabBarHiddenContext value={setIsBottomTabBarHidden}>
      <BottomTabBarHiddenContext value={isBottomTabBarHidden}>{children}</BottomTabBarHiddenContext>
    </SetBottomTabBarHiddenContext>
  );
}

export function useBottomTabBarHidden() {
  const context = use(BottomTabBarHiddenContext);

  if (context === null) {
    throw new Error('useBottomTabBarHidden must be used within BottomTabBarVisibilityProvider');
  }

  return context;
}

export function useSetBottomTabBarHidden() {
  const context = use(SetBottomTabBarHiddenContext);

  if (!context) {
    throw new Error('useSetBottomTabBarHidden must be used within BottomTabBarVisibilityProvider');
  }

  return context;
}
