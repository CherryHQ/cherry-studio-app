import { Stack } from 'expo-router';

import { mainHeaderScreenOptions, RouteHeaderProvider } from '@/frontend/appShell/header';
import { getTransparentHeaderStyle } from '@/frontend/appShell/navigation';
import { type FilePaneFile, FilePaneHost } from '@/frontend/appShell/pane';
import { FileViewerPane } from '@/frontend/features/files';
import { FileLibraryScreen } from '@/frontend/features/library';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';

/**
 * Native-stack host for the chat surface. The drawer scene itself renders no
 * header; `MainHeader` drives this stack's toolbar and search-bar slots, which
 * only exist inside a native stack screen. The header module decides whether that
 * native header exists, and the route declares it here so the first frame already
 * has the right one. Wider windows show files beside it.
 */
export default function ChatStackLayout() {
  const [foregroundColor, chatBackgroundColor] = useThemeColor(['foreground', 'chat-background']);

  return (
    // The chat always leads with the sidebar; other pages do only at a wide window's first level.
    <RouteHeaderProvider rootAction="drawer">
      <FilePaneHost library={<FileLibraryScreen />} renderFile={renderPaneFile}>
        <Stack
          screenOptions={{
            ...mainHeaderScreenOptions,
            contentStyle: { backgroundColor: chatBackgroundColor },
            headerStyle: getTransparentHeaderStyle(),
            headerTintColor: foregroundColor,
          }}
        />
      </FilePaneHost>
    </RouteHeaderProvider>
  );
}

function renderPaneFile(file: FilePaneFile) {
  return <FileViewerPane {...file} />;
}
