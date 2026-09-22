import type MarkdownIt from 'markdown-it';

import { escapeHtml } from './normalizeDocument';

/** Wide tables become labelled records in captures and on narrow HTML/Markdown previews. */
export function configureExportTables(parser: MarkdownIt, isImage: boolean, label: string) {
  parser.renderer.rules.table_open = (tokens, index) =>
    `<div class="table-scroll${tokens[index].attrGet('class') === 'table-wide' ? ' table-wide' : ''}" role="region" aria-label="${escapeHtml(label)}"${isImage ? '' : ' tabindex="0"'}><table${parser.renderer.renderAttrs(tokens[index])}>`;
  parser.renderer.rules.table_close = () => '</table></div>\n';

  parser.core.ruler.after('inline', 'export_table_records', (state) => {
    for (let start = 0; start < state.tokens.length; start++) {
      if (state.tokens[start].type !== 'table_open') continue;
      let end = start + 1;
      while (end < state.tokens.length && state.tokens[end].type !== 'table_close') end++;
      const rows: (typeof state.tokens)[] = [];
      for (let index = start + 1; index < end; index++) {
        const token = state.tokens[index];
        if (token.type === 'tr_open') rows.push([]);
        if (token.type === 'inline' && rows.length) rows[rows.length - 1].push(token);
      }
      const [headers = [], ...body] = rows;
      if (headers.length <= 3 || !body.length) continue;
      if (!isImage) {
        state.tokens[start].attrSet('class', 'table-wide');
        const labels = headers.map((header) =>
          parser.renderer.renderInlineAsText(header.children ?? [], state.md.options, state.env),
        );
        let column = 0;
        for (let index = start + 1; index < end; index++) {
          const token = state.tokens[index];
          if (token.type === 'tr_open') column = 0;
          if (token.type === 'td_open') token.attrSet('data-label', labels[column++] ?? '');
        }
        continue;
      }
      const renderCell = (cell: (typeof state.tokens)[number] | undefined) =>
        parser.renderer.renderInline(cell?.children ?? [], state.md.options, state.env);
      const replacement = new state.Token('html_block', '', 0);
      replacement.content = `<div class="table-records">${body
        .map(
          (cells) =>
            `<div class="table-record">${cells
              .map(
                (cell, index) =>
                  `<div class="table-field"><div class="table-field-label">${renderCell(headers[index])}</div><div>${renderCell(cell)}</div></div>`,
              )
              .join('')}</div>`,
        )
        .join('')}</div>\n`;
      state.tokens.splice(start, end - start + 1, replacement);
    }
  });
}
