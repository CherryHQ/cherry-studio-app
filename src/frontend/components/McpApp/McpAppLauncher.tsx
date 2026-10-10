import { createMcpAppHtml } from '@cherrystudio/mcp-app-webview';
import { BottomSheet, Button, ContentState, Dialog } from '@cherrystudio/ui/components';
import { randomUUID } from 'expo-crypto';
import { useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useUniwind, withUniwind } from 'uniwind';

import { useBackendModule } from '@/frontend/data';
import { JsonValueSchema } from '@/shared/contracts/agent';
import {
  McpAppReferenceSchema,
  type McpAppLaunch,
  type McpAppReference,
  type McpAppView,
} from '@/shared/contracts/mcpApp';

import { useMcpAppConversation } from './McpAppConversationProvider';

const AppWebView = withUniwind(WebView);
const SHELL_ORIGIN = 'https://mcp-app.invalid';

type LauncherProps = { reference: McpAppReference; input: unknown; result: unknown };
export function McpAppLauncher({ reference, input, result }: LauncherProps) {
  const { t } = useTranslation();
  const { theme } = useUniwind();
  const { i18n } = useTranslation();
  const { width, height } = useWindowDimensions();
  const conversation = useMcpAppConversation();
  const [launch, setLaunch] = useState<McpAppLaunch>();
  if (!conversation || conversation.agentId !== reference.agentId) return null;
  function open() {
    const ref = McpAppReferenceSchema.safeParse(reference);
    const args = JsonValueSchema.safeParse(input ?? {});
    const output = JsonValueSchema.safeParse(result ?? null);
    if (!ref.success || !args.success || !output.success) return;
    setLaunch({
      reference: ref.data,
      input: args.data,
      result: output.data,
      hostContext: {
        theme: theme === 'dark' ? 'dark' : 'light',
        locale: i18n.resolvedLanguage ?? i18n.language,
        containerDimensions: { width, height },
      },
    });
  }
  return (
    <>
      <Button variant="secondary" onPress={open}>
        {t('mcp.apps.open')}
      </Button>
      {launch ? <McpAppWindow launch={launch} onClose={() => setLaunch(undefined)} /> : null}
    </>
  );
}

type Confirmation = { kind: 'link' | 'message'; value: string; finish(accepted: boolean): void };
function McpAppWindow({ launch, onClose }: { launch: McpAppLaunch; onClose(): void }) {
  const mcp = useBackendModule('mcp');
  const conversation = useMcpAppConversation();
  const { t, i18n } = useTranslation();
  const { theme } = useUniwind();
  const webView = useRef<WebView>(null);
  const [nonce] = useState(randomUUID);
  const [view, setView] = useState<McpAppView>();
  const [failed, setFailed] = useState(false);
  const [closing, setClosing] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const confirmationRef = useRef<Confirmation | undefined>(undefined);
  const session = useRef<{ id: string; abort: AbortController } | undefined>(undefined);
  const [dimensions, setDimensions] = useState(launch.hostContext.containerDimensions);

  const source = useMemo(
    () =>
      view
        ? {
            html: createMcpAppHtml({ html: view.html, nonce, policy: view.policy }),
            baseUrl: SHELL_ORIGIN,
          }
        : undefined,
    [nonce, view],
  );
  useEffect(() => {
    if (!conversation) return;
    const abort = new AbortController();
    let id: string | undefined;
    const confirm = (kind: Confirmation['kind'], value: string) =>
      new Promise<void>((resolve, reject) => {
        if (abort.signal.aborted || confirmationRef.current) {
          reject(new Error('The MCP App is unavailable.'));
          return;
        }
        const finish = (accepted: boolean) => {
          abort.signal.removeEventListener('abort', cancel);
          confirmationRef.current = undefined;
          setConfirmation(undefined);
          if (accepted) resolve();
          else reject(new Error('The user declined.'));
        };
        const cancel = () => finish(false);
        const pending = { kind, value, finish };
        confirmationRef.current = pending;
        setConfirmation(pending);
        abort.signal.addEventListener('abort', cancel, { once: true });
      });
    void mcp
      .openApp(
        launch,
        {
          send: (message) =>
            webView.current?.injectJavaScript(
              `window.__cherryMcpReceive?.(${message.replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029')});true;`,
            ),
          openLink: async (url) => {
            await confirm('link', url);
            abort.signal.throwIfAborted();
            await WebBrowser.openBrowserAsync(url);
          },
          message: async (text) => {
            await confirm('message', text);
            abort.signal.throwIfAborted();
            conversation.message(text);
          },
          updateContext: (text) => {
            if (!abort.signal.aborted)
              conversation.updateContext(
                `${launch.reference.serverId}:${launch.reference.resourceUri}`,
                launch.reference.toolName,
                text,
              );
          },
          closed: () => {
            if (!abort.signal.aborted) {
              setFailed(true);
              abort.abort();
            }
          },
        },
        abort.signal,
      )
      .then((opened) => {
        id = opened.id;
        if (abort.signal.aborted) {
          void mcp.closeApp(id);
          return;
        }
        session.current = { id, abort };
        setView(opened);
      })
      .catch(() => {
        if (!abort.signal.aborted) setFailed(true);
      });
    return () => {
      abort.abort();
      if (id) void mcp.closeApp(id);
      session.current = undefined;
    };
  }, [conversation, launch, mcp]);
  useEffect(() => {
    if (view)
      mcp.updateAppContext(view.id, {
        theme: theme === 'dark' ? 'dark' : 'light',
        locale: i18n.resolvedLanguage ?? i18n.language,
        containerDimensions: dimensions,
      });
  }, [dimensions, i18n.language, i18n.resolvedLanguage, mcp, theme, view]);
  useFocusEffect(
    useCallback(
      () => () => {
        session.current?.abort.abort();
        if (session.current) void mcp.closeApp(session.current.id);
      },
      [mcp],
    ),
  );
  async function close() {
    if (closing) return;
    setClosing(true);
    if (view) await mcp.closeApp(view.id);
    webView.current?.injectJavaScript('window.__cherryMcpDispose?.();true;');
    onClose();
  }
  function fail() {
    setFailed(true);
    session.current?.abort.abort();
    if (session.current) void mcp.closeApp(session.current.id);
  }
  return (
    <>
      <BottomSheet
        open
        onClose={() => void close()}
        size="full"
        title={view?.title ?? launch.reference.toolName}
        closeAction={{ accessibilityLabel: t('mcp.apps.close') }}
      >
        {failed ? (
          <View className="flex-1 justify-center px-6">
            <ContentState.Error title={t('mcp.apps.failed')} description={t('mcp.apps.fallback')} />
          </View>
        ) : !view ? (
          <View className="flex-1 justify-center">
            <ContentState.Loading title={t('mcp.apps.loading')} />
          </View>
        ) : (
          <View
            className="flex-1"
            onLayout={({ nativeEvent }) =>
              setDimensions({ width: nativeEvent.layout.width, height: nativeEvent.layout.height })
            }
          >
            <AppWebView
              ref={webView}
              className="flex-1 bg-background"
              containerClassName="flex-1"
              source={source}
              originWhitelist={['*']}
              incognito
              sharedCookiesEnabled={false}
              thirdPartyCookiesEnabled={false}
              allowFileAccess={false}
              allowFileAccessFromFileURLs={false}
              allowUniversalAccessFromFileURLs={false}
              javaScriptCanOpenWindowsAutomatically={false}
              geolocationEnabled={false}
              mediaCapturePermissionGrantType="deny"
              setSupportMultipleWindows={false}
              onOpenWindow={() => {}}
              onShouldStartLoadWithRequest={({ url, isTopFrame }) =>
                url === 'about:blank' ||
                url === SHELL_ORIGIN ||
                url === `${SHELL_ORIGIN}/` ||
                (!isTopFrame && url.startsWith(`blob:${SHELL_ORIGIN}/`))
              }
              onMessage={({ nativeEvent }) => {
                if (nativeEvent.data.length > 256 * 1024) return;
                try {
                  const envelope = JSON.parse(nativeEvent.data);
                  if (envelope.nonce === nonce && envelope.message)
                    mcp.receiveAppMessage(view.id, JSON.stringify(envelope.message));
                } catch {
                  /* Untrusted web data. */
                }
              }}
              onError={fail}
              onRenderProcessGone={fail}
              onContentProcessDidTerminate={fail}
            />
          </View>
        )}
      </BottomSheet>
      {confirmation ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) confirmation.finish(false);
          }}
          title={t(confirmation.kind === 'link' ? 'mcp.apps.openLink' : 'mcp.apps.message')}
        >
          <ScrollView className="max-h-80">
            <Text className="text-base text-foreground" selectable>
              {confirmation.kind === 'link'
                ? `${new URL(confirmation.value).host}\n\n${confirmation.value}`
                : confirmation.value}
            </Text>
          </ScrollView>
          <Button onPress={() => confirmation.finish(true)}>
            {t(confirmation.kind === 'link' ? 'mcp.interaction.open' : 'mcp.content.add')}
          </Button>
          <Button variant="secondary" onPress={() => confirmation.finish(false)}>
            {t('common.cancel')}
          </Button>
        </Dialog>
      ) : null}
    </>
  );
}
