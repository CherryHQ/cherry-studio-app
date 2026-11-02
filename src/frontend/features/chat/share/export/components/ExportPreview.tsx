import { useMemo, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { WebView } from 'react-native-webview';

import type {
  DocumentExportArtifact,
  DocumentExportSession,
  ExportPresentation,
} from '@/shared/contracts/documentExport';
import { renderMarkdownSignature } from '@/shared/utils/documentExportMarkdown';

export function ArtifactPreview({
  artifact,
  width,
  onError,
}: {
  artifact: Exclude<DocumentExportArtifact, { format: 'image' }>;
  width: number;
  onError(): void;
}) {
  const source = useMemo(
    () => (artifact.format === 'html' ? { html: artifact.html } : undefined),
    [artifact],
  );
  if (!source) return null;
  return <HtmlPreview source={source} onError={onError} width={width} />;
}

export function MarkdownPreview({
  session,
  presentation,
  text,
  width,
}: {
  session: DocumentExportSession;
  presentation: ExportPresentation;
  text: string;
  width: number;
}) {
  const [failed, setFailed] = useState(false);
  const source = useMemo(() => {
    try {
      return { html: session.previewMarkdown(text, presentation) };
    } catch {
      return undefined;
    }
  }, [session, text, presentation]);
  if (failed || !source)
    return (
      <ScrollView className="flex-1" contentContainerClassName="px-5 py-4">
        <Text selectable className="font-mono text-foreground text-sm">
          {session.markdown + renderMarkdownSignature(presentation.watermark)}
        </Text>
      </ScrollView>
    );
  return <HtmlPreview source={source} width={width} onError={() => setFailed(true)} />;
}

function HtmlPreview({
  source,
  onError,
  width,
}: {
  source: { html: string };
  onError(): void;
  width: number;
}) {
  return (
    <WebView
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      incognito
      javaScriptEnabled={false}
      onError={onError}
      onContentProcessDidTerminate={onError}
      onRenderProcessGone={onError}
      onShouldStartLoadWithRequest={({ url }) => url === 'about:blank'}
      originWhitelist={['*']}
      sharedCookiesEnabled={false}
      source={source}
      style={{ width, alignSelf: 'center', backgroundColor: 'transparent' }}
      textZoom={100}
      thirdPartyCookiesEnabled={false}
    />
  );
}
