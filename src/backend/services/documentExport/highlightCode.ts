import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

import { escapeHtml } from './normalizeDocument';

// Only explicit languages: no autodetection, DOM, remote assets or runtime grammar loading.
const highlighter = hljs.newInstance();
for (const [name, grammar] of Object.entries({
  bash,
  css,
  java,
  javascript,
  json,
  python,
  sql,
  typescript,
  xml,
  yaml,
})) {
  highlighter.registerLanguage(name, grammar);
}

export function highlightCode(source: string, language: string) {
  // Bound optional decoration; the complete source is always preserved in the fallback.
  if (source.length <= 24_000 && language && highlighter.getLanguage(language)) {
    try {
      const result = highlighter.highlight(source, { language, ignoreIllegals: true });
      if (!result.errorRaised && result.value.length <= source.length * 20 + 1024)
        return { html: result.value, highlighted: true };
    } catch {
      // An unsupported grammar or engine feature cannot prevent sharing the source.
    }
  }
  return { html: escapeHtml(source), highlighted: false };
}
