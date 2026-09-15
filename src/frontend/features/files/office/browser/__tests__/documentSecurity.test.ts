/** @jest-environment jsdom */
import { installOfficeContentPolicy, sanitizeDocumentLinks } from '../documentSecurity';

it('routes external anchor and PPTX window.open actions without navigating the shell', () => {
  const open = jest.fn();
  const original = window.open;
  const before = window.location.href;
  const remove = installOfficeContentPolicy(open);
  try {
    document.body.innerHTML = '<a href="https://example.com/doc"><span>Read</span></a>';
    const target = document.querySelector('span')!;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(open).toHaveBeenCalledWith('https://example.com/doc');
    window.open('mailto:reader@example.com');
    expect(open).toHaveBeenCalledWith('mailto:reader@example.com');
    window.open('file:///private/data');
    expect(open).toHaveBeenCalledTimes(2);
    expect(window.location.href).toBe(before);
  } finally {
    remove();
    document.body.replaceChildren();
  }
  expect(window.open).toBe(original);
});

it('scrolls and focuses a local bookmark while retaining safe hrefs', () => {
  const open = jest.fn();
  const remove = installOfficeContentPolicy(open);
  try {
    document.body.innerHTML =
      '<a href="#chapter%3A2">Jump</a><div id="chapter:2">Chapter</div><a href="javascript:alert(1)">Bad</a>';
    const chapter = document.getElementById('chapter:2')!;
    chapter.scrollIntoView = jest.fn();
    sanitizeDocumentLinks(document.body);
    const links = document.querySelectorAll('a');
    expect(links[0].getAttribute('href')).toBe('#chapter%3A2');
    expect(links[1].hasAttribute('href')).toBe(false);
    links[0].click();
    expect(chapter.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    expect(document.activeElement).toBe(chapter);
    expect(open).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
  } finally {
    remove();
    document.body.replaceChildren();
  }
});
