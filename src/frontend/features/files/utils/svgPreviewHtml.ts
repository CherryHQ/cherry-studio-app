/** Image context disables SVG scripts, links, and external resources in the browser. */
export function svgPreviewHtml(data: string, paper: string): string {
  return `<!doctype html><html><head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
    <style>
      :root { color-scheme: light; background: ${paper}; }
      body { margin: 0; padding: 16px; display: flex; min-height: calc(100vh - 32px); align-items: center; justify-content: center; }
      img { display: block; width: 100%; max-height: calc(100vh - 32px); object-fit: contain; }
    </style></head><body><img src="data:image/svg+xml;base64,${data}" alt=""></body></html>`;
}
