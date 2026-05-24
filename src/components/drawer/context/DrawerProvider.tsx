import { useQueryClient } from '@tanstack/react-query';
import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Keyboard } from 'react-native';

import { useDatabaseRuntime } from '@/data/runtime';
import type { Topic } from '@/data/types/topic';
import { useTopics } from '@/hooks/chat';
import { prefetchTopicMessages } from '@/hooks/chat/utils/messageQueryOptions';
import { messageWindowPolicy } from '@/hooks/chat/utils/messageWindowPolicy';

type DrawerPanelStateContextValue = {
  isOpen: boolean;
  isSearchActive: boolean;
  searchText: string;
};

type DrawerTopicsContextValue = {
  activeTopicId?: string;
  isTopicListLoading: boolean;
  topics: readonly Topic[];
};

type DrawerActionsContextValue = {
  closeDrawer: () => void;
  closeSearch: () => void;
  loadMoreTopics: () => void;
  openDrawer: () => void;
  openSearch: () => void;
  openSettings: () => void;
  openTopic: (topicId: string) => void;
  setSearchText: (value: string) => void;
};

type DrawerNavigationController = {
  closeDrawer: () => void;
  openDrawer: () => void;
};

type DrawerNavigationBridgeContextValue = {
  registerDrawerController: (controller: DrawerNavigationController | null) => void;
  setDrawerOpen: (isOpen: boolean) => void;
};

const DrawerPanelStateContext = createContext<DrawerPanelStateContextValue | null>(null);
const DrawerTopicsContext = createContext<DrawerTopicsContextValue | null>(null);
const DrawerActionsContext = createContext<DrawerActionsContextValue | null>(null);
const DrawerNavigationBridgeContext = createContext<DrawerNavigationBridgeContextValue | null>(
  null,
);

function getSingleParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value.at(0) : value;
}

export function DrawerProvider({ children }: PropsWithChildren) {
  const params = useGlobalSearchParams<{ topicId?: string | string[] }>();
  const topicId = getSingleParamValue(params.topicId);
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { services } = useDatabaseRuntime();
  const [isOpen, setIsOpen] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchText, setSearchText] = useState('');
  const drawerControllerRef = useRef<DrawerNavigationController | null>(null);
  const topicList = useTopics({ q: searchText });

  useEffect(() => {
    for (const topic of topicList.topics.slice(0, messageWindowPolicy.drawerPrefetchTopicCount)) {
      void prefetchTopicMessages(queryClient, services, topic.id);
    }
  }, [queryClient, services, topicList.topics]);

  const registerDrawerController = useCallback((controller: DrawerNavigationController | null) => {
    drawerControllerRef.current = controller;
  }, []);

  const setDrawerOpen = useCallback((nextIsOpen: boolean) => {
    setIsOpen(nextIsOpen);
  }, []);

  const openDrawer = useCallback(() => {
    drawerControllerRef.current?.openDrawer();
    setIsOpen(true);
  }, []);

  const closeSearch = useCallback(() => {
    Keyboard.dismiss();
    setIsSearchActive(false);
    setSearchText('');
  }, []);

  const openSearch = useCallback(() => {
    setIsSearchActive(true);
  }, []);

  const closeDrawer = useCallback(() => {
    Keyboard.dismiss();
    drawerControllerRef.current?.closeDrawer();
    setIsOpen(false);
  }, []);

  const openSettings = useCallback(() => {
    Keyboard.dismiss();
    router.push('/settings');
  }, [router]);

  const openTopic = useCallback(
    (nextTopicId: string) => {
      void prefetchTopicMessages(queryClient, services, nextTopicId);

      if (topicId !== nextTopicId) {
        if (pathname === '/topics') {
          router.setParams({ topicId: nextTopicId });
        } else {
          router.replace({
            params: { topicId: nextTopicId },
            pathname: '/topics',
          });
        }
      }

      closeSearch();
      closeDrawer();
    },
    [closeDrawer, closeSearch, pathname, queryClient, router, services, topicId],
  );

  const panelStateValue = useMemo(
    () => ({
      isOpen,
      isSearchActive,
      searchText,
    }),
    [isOpen, isSearchActive, searchText],
  );

  const topicsValue = useMemo(
    () => ({
      activeTopicId: topicId,
      isTopicListLoading: topicList.isLoadingInitial,
      topics: topicList.topics,
    }),
    [topicId, topicList.isLoadingInitial, topicList.topics],
  );

  const actionsValue = useMemo(
    () => ({
      closeDrawer,
      closeSearch,
      loadMoreTopics: topicList.loadMore,
      openDrawer,
      openSearch,
      openSettings,
      openTopic,
      setSearchText,
    }),
    [closeDrawer, closeSearch, openDrawer, openSearch, openSettings, openTopic, topicList.loadMore],
  );

  const navigationBridgeValue = useMemo(
    () => ({
      registerDrawerController,
      setDrawerOpen,
    }),
    [registerDrawerController, setDrawerOpen],
  );

  return (
    <DrawerPanelStateContext value={panelStateValue}>
      <DrawerTopicsContext value={topicsValue}>
        <DrawerActionsContext value={actionsValue}>
          <DrawerNavigationBridgeContext value={navigationBridgeValue}>
            {children}
          </DrawerNavigationBridgeContext>
        </DrawerActionsContext>
      </DrawerTopicsContext>
    </DrawerPanelStateContext>
  );
}

export function useDrawerPanelState() {
  const context = use(DrawerPanelStateContext);

  if (!context) {
    throw new Error('useDrawerPanelState must be used within a DrawerProvider');
  }

  return context;
}

export function useDrawerTopics() {
  const context = use(DrawerTopicsContext);

  if (!context) {
    throw new Error('useDrawerTopics must be used within a DrawerProvider');
  }

  return context;
}

export function useDrawerActions() {
  const context = use(DrawerActionsContext);

  if (!context) {
    throw new Error('useDrawerActions must be used within a DrawerProvider');
  }

  return context;
}

export function useDrawerNavigationBridge() {
  const context = use(DrawerNavigationBridgeContext);

  if (!context) {
    throw new Error('useDrawerNavigationBridge must be used within a DrawerProvider');
  }

  return context;
}

export function useDrawer() {
  const panelState = useDrawerPanelState();
  const topics = useDrawerTopics();
  const actions = useDrawerActions();

  return useMemo(
    () => ({
      ...panelState,
      ...topics,
      ...actions,
    }),
    [panelState, topics, actions],
  );
}
