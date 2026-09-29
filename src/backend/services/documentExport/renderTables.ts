import type { MarkdownIt } from 'markdown-it';

import { escapeHtml } from './normalizeDocument';

/** Keep Markdown table semantics in every format; only interactive views can scroll. */
export function configureExportTables(parser: MarkdownIt, isImage: boolean, label: string) {
  parser.renderer.rules.table_open = (tokens, index) =>
    `<div class="table-scroll" role="region" aria-label="${escapeHtml(label)}"${isImage ? '' : ' tabindex="0"'}><table${parser.renderer.renderAttrs(tokens[index])}>`;
  parser.renderer.rules.table_close = () => '</table></div>\n';
}
