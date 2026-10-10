import { FILE_PREVIEW_BASE_URL } from '@cherrystudio/file-preview-webview/protocol';

import { htmlNavigationAction } from './htmlNavigation';

const PREVIEW_ORIGIN = new URL(FILE_PREVIEW_BASE_URL).origin;

/** Whether a URL belongs to the preview page's reserved origin; Android omits the trailing slash. */
export function isDocumentPreviewOrigin(url: string): boolean {
  try {
    return new URL(url).origin === PREVIEW_ORIGIN;
  } catch {
    return false;
  }
}

/**
 * The trusted preview page loads at its reserved base URL; every other destination follows
 * the HTML viewer's policy: web links leave through the browser, the rest stay blocked.
 */
export function documentPreviewNavigationAction(
  url: string,
  isTopFrame = true,
): 'allow' | 'block' | 'external' {
  if (isDocumentPreviewOrigin(url)) {
    // The reserved origin serves nothing but the page itself and its anchors.
    const { pathname, search } = new URL(url);
    return pathname === '/' && !search ? 'allow' : 'block';
  }
  return htmlNavigationAction(url, isTopFrame);
}
