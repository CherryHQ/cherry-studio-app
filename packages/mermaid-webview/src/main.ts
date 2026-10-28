import mermaid from 'mermaid';

import {
  MERMAID_SOURCE_LIMIT,
  MERMAID_SVG_LIMIT,
  type MermaidPageMessage,
  type MermaidPageRequest,
} from './protocol';

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage(message: string): void };
    cherryMermaid?: { render(request: MermaidPageRequest): void };
  }
}

// The page cannot load the app's fonts. System fonts measured here are the same ones the
// display WebView draws with, so labels fit their shapes.
const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", Roboto, "Noto Sans CJK SC", "Noto Sans SC", sans-serif';

// Pie slices are categorical data, so they keep distinct hues (Tableau 10) where the monochrome
// theme would make them indistinguishable. Black labels keep 4.5:1 contrast on every slice.
const PIE_COLORS = [
  '#4e79a7',
  '#f28e2b',
  '#e15759',
  '#76b7b2',
  '#59a14f',
  '#edc948',
  '#b07aa1',
  '#ff9da7',
  '#9c755f',
  '#bab0ac',
];
const THEME_VARIABLES = {
  ...Object.fromEntries(PIE_COLORS.map((color, index) => [`pie${index + 1}`, color])),
  pieOpacity: '1',
  pieSectionTextColor: '#000000',
};

let configuredTheme: 'redux' | 'redux-dark' | undefined;
let queue = Promise.resolve();

function post(message: MermaidPageMessage) {
  window.ReactNativeWebView?.postMessage(JSON.stringify(message));
}

function configure(dark: boolean) {
  // Monochrome outlined themes match the app's neutral surfaces in both appearances.
  const theme = dark ? 'redux-dark' : 'redux';
  if (configuredTheme === theme) return;
  mermaid.initialize({
    fontFamily: FONT_FAMILY,
    maxTextSize: MERMAID_SOURCE_LIMIT,
    // Strict mode encodes label HTML and disables click callbacks and links.
    securityLevel: 'strict',
    startOnLoad: false,
    suppressErrorRendering: true,
    theme,
    themeVariables: THEME_VARIABLES,
  });
  configuredTheme = theme;
}

function readViewBox(svg: string): { width: number; height: number } | undefined {
  const viewBox = /<svg\b[^>]*?\sviewBox="([^"]+)"/.exec(svg)?.[1];
  const [, , width, height] =
    viewBox
      ?.trim()
      .split(/[\s,]+/)
      .map(Number) ?? [];
  return width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height)
    ? { width, height }
    : undefined;
}

async function renderOne({ id, source, dark }: MermaidPageRequest) {
  const elementId = `cherry-mermaid-${id}`;
  try {
    if (source.length > MERMAID_SOURCE_LIMIT) throw new Error('Source is too large');
    configure(dark);
    const { svg } = await mermaid.render(elementId, source);
    const size = readViewBox(svg);
    if (!size || svg.length > MERMAID_SVG_LIMIT) throw new Error('Unusable SVG');
    post({ type: 'rendered', id, svg, ...size });
  } catch {
    post({ type: 'failed', id });
  } finally {
    // Mermaid can leave its temporary container behind when parsing fails.
    document.getElementById(elementId)?.remove();
    document.getElementById(`d${elementId}`)?.remove();
  }
}

window.cherryMermaid = {
  render(request) {
    queue = queue.then(() => renderOne(request));
  },
};
post({ type: 'ready' });
