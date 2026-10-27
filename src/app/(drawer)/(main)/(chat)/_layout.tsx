import { Stack } from 'expo-router';

import { headerScreenOptions, RouteHeaderProvider } from '@/frontend/appShell/header';
import { getTransparentHeaderStyle } from '@/frontend/appShell/navigation';
import { type FilePaneFile, FilePaneHost } from '@/frontend/appShell/pane';
import { FileViewerPane } from '@/frontend/features/files';
import { FileLibraryScreen } from '@/frontend/features/library';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { isLiquidGlassAvailable } from '@/frontend/utils/constants';

/**
 * Native-stack host for the chat surface. The drawer scene itself renders no
 * header; `MainHeader` drives this stack's toolbar and search-bar slots, which
 * only exist inside a native stack screen. Wider windows show files beside it.
 */
export default function ChatStackLayout() {
  const [foregroundColor, chatBackgroundColor] = useThemeColor(['foreground', 'chat-background']);

  return (
    // Only the chat leads with the sidebar; every other page in the content region leads with back.
    <RouteHeaderProvider rootAction="drawer">
      <FilePaneHost library={<FileLibraryScreen />} renderFile={renderPaneFile}>
        <Stack
          screenOptions={{
            ...headerScreenOptions,
            contentStyle: { backgroundColor: chatBackgroundColor },
            headerStyle: getTransparentHeaderStyle(),
            headerTintColor: foregroundColor,
            headerTransparent: isLiquidGlassAvailable,
          }}
        />
      </FilePaneHost>
    </RouteHeaderProvider>
  );
}

function renderPaneFile(file: FilePaneFile) {
  return <FileViewerPane {...file} />;
}
