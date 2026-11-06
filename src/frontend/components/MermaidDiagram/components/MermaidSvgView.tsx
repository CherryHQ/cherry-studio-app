import { useMemo } from 'react';
import { WebView } from 'react-native-webview';
import { withUniwind } from 'uniwind';

import { createMermaidDocument, type MermaidDocumentVariant } from '../utils/mermaidDocument';
import type { MermaidRenderResult } from '../utils/mermaidRenderer';

const SvgWebView = withUniwind(WebView);
const ORIGIN_WHITELIST = ['about:blank'];

type MermaidSvgViewProps = {
  diagram: Extract<MermaidRenderResult, { status: 'rendered' }>;
  variant: MermaidDocumentVariant;
};

/** Displays rendered SVG in a script-free WebView. */
export function MermaidSvgView({ diagram, variant }: MermaidSvgViewProps) {
  const source = useMemo(
    () => ({ html: createMermaidDocument(diagram, variant) }),
    [diagram, variant],
  );

  return (
    <SvgWebView
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      className="flex-1 bg-transparent"
      containerClassName="flex-1 bg-transparent"
      incognito
      javaScriptEnabled={false}
      onShouldStartLoadWithRequest={({ url }) => url === 'about:blank'}
      originWhitelist={ORIGIN_WHITELIST}
      sharedCookiesEnabled={false}
      source={source}
      textZoom={100}
      thirdPartyCookiesEnabled={false}
    />
  );
}
