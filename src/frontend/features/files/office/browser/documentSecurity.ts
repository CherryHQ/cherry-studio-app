import { officeLinkTarget } from '../officeLinkPolicy';

/** Embedded content cannot navigate the shell. External links cross the native URL policy. */
export function installOfficeContentPolicy(openLink: (url: string) => void) {
  const meta = document.createElement('meta');
  meta.httpEquiv = 'Content-Security-Policy';
  meta.content =
    "default-src 'none'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src data: blob:; font-src data: blob:; media-src data: blob:; connect-src 'self'; base-uri 'none'; form-action 'none'";
  if (window.location.protocol === 'file:')
    meta.content = meta.content.replace("connect-src 'self'", "connect-src 'none'");
  document.head.prepend(meta);
  const followLink = (raw: string) => {
    const target = officeLinkTarget(raw);
    if (target?.kind === 'external') openLink(target.value);
    if (target?.kind === 'bookmark') {
      const element =
        document.getElementById(target.value) ??
        Array.from(document.getElementsByName(target.value)).find(
          (node) => node instanceof HTMLElement,
        );
      if (element instanceof HTMLElement) {
        element.scrollIntoView({ block: 'start' });
        if (!element.hasAttribute('tabindex')) element.tabIndex = -1;
        element.focus({ preventScroll: true });
      }
    }
  };
  const handleLink = (event: MouseEvent) => {
    const element = event.target instanceof Element ? event.target : null;
    const anchor = element?.closest('a, area');
    if (!anchor) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === 'click' || event.button === 1) {
      followLink(anchor.getAttribute('href') ?? anchor.getAttribute('xlink:href') ?? '');
    }
  };
  // PPTX shape actions call window.open directly; internal slide actions stay in the SDK.
  const originalOpen = window.open;
  window.open = (url) => {
    if (url != null) followLink(String(url));
    return null;
  };
  document.addEventListener('click', handleLink, true);
  document.addEventListener('auxclick', handleLink, true);
  return () => {
    window.open = originalOpen;
    document.removeEventListener('click', handleLink, true);
    document.removeEventListener('auxclick', handleLink, true);
    meta.remove();
  };
}

export function sanitizeDocumentLinks(root: HTMLElement) {
  for (const link of root.querySelectorAll('a, area')) {
    const raw = link.getAttribute('href') ?? link.getAttribute('xlink:href') ?? '';
    if (!officeLinkTarget(raw)) {
      link.removeAttribute('href');
      link.removeAttribute('xlink:href');
    }
    link.removeAttribute('target');
    link.setAttribute('rel', 'noopener noreferrer');
  }
}
