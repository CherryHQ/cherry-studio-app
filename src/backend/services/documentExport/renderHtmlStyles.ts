import type { ExportPresentation } from '@/shared/contracts/documentExport';
import { getExportSignature } from '@/shared/contracts/fileExport';
import { EXPORT_SIGNATURE_STYLE } from '@/shared/utils/exportSignature';

/** One content vocabulary; only interactive overflow/disclosures adapt for static capture. */
export function renderHtmlStyles(presentation: ExportPresentation) {
  const { colors, typography, width, imageFrame } = presentation;
  const { base, sm, lg, xl } = typography;
  const signature = getExportSignature(presentation.watermark);
  const footer = EXPORT_SIGNATURE_STYLE;
  const scale = imageFrame ? width / footer.referenceWidth : 1;
  const size = (value: number) => value * scale;
  return `
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:${colors.background};color:${colors.foreground}}
body{font:${base.fontSize}px/${base.lineHeight + 2}px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;overflow-wrap:anywhere;-webkit-text-size-adjust:100%}
main{width:100%;max-width:${width}px;margin:0 auto}
.document-content{padding:16px 20px 24px;display:flex;flex-direction:column;gap:24px}
.conversation{padding:16px 20px 24px;gap:24px}
.document-title{font-size:${xl.fontSize + 4}px;line-height:${xl.lineHeight + 6}px;margin:0;letter-spacing:-.02em}
.document-section{min-width:0;display:flex;flex-direction:column;gap:16px}
.document-section+.document-section{border-top:1px solid ${colors.subtleBorder};padding-top:24px}
.section-heading{font-size:${sm.fontSize}px;line-height:${sm.lineHeight}px;color:${colors.muted};margin:0}
.message-row{min-width:0;display:flex;flex-direction:column;gap:10px}
.message-heading{font-size:${sm.fontSize}px;line-height:${sm.lineHeight}px;color:${colors.foreground};margin:0}
.bubble-row{display:flex;justify-content:flex-end;min-width:0}
.bubble-column{width:88%;display:flex;align-items:flex-end;flex-direction:column;gap:8px;min-width:0}
.bubble{max-width:100%;min-width:0;padding:10px 16px;border-radius:18px;background:${colors.bubble};line-height:${base.lineHeight}px}
.bubble>.plain-text+.plain-text{margin-top:8px}
.attachments{width:100%;min-width:0;display:flex;flex-direction:column;gap:8px}
.attachments .export-image{align-items:flex-end}
.attachments img{max-height:320px}
.message-content{display:flex;flex-direction:column;gap:16px;min-width:0}
.message-content>*,.markdown>:last-child,.details-content>:last-child,.bubble>:last-child{margin-bottom:0}
.plain-text{white-space:pre-wrap}
h1,h2,h3,h4,h5,h6,p,ul,ol,pre,blockquote,table,hr,.code-block,.table-scroll{margin:0 0 12px}
h1,h2,h3,h4,h5,h6,strong,b,th{font-weight:600}
h1{font-size:${xl.fontSize}px;line-height:${xl.lineHeight}px}
h2{font-size:${lg.fontSize}px;line-height:${lg.lineHeight}px}
h3,h4,h5{font-size:${base.fontSize}px;line-height:${base.lineHeight}px}
h6{font-size:${sm.fontSize}px;line-height:${sm.lineHeight}px}
.markdown h1{margin-bottom:10px}.markdown h2,.markdown h3{margin-bottom:8px}.markdown h4,.markdown h5,.markdown h6{margin-bottom:6px}
.muted,.resource-note{color:${colors.muted};font-size:${sm.fontSize}px;line-height:${sm.lineHeight}px}
a{color:${colors.link};text-decoration:none;overflow-wrap:anywhere}
a.citation-link{color:${colors.muted};font-size:.75em;font-weight:500;line-height:0;vertical-align:super;padding:0 2px}
a:focus-visible,summary:focus-visible,[tabindex]:focus-visible{outline:2px solid ${colors.link};outline-offset:3px}
.resource-card{display:flex;align-items:center;gap:12px;width:100%;padding:10px 12px;background:${colors.secondary};border-radius:12px;font-size:${sm.fontSize}px;line-height:${sm.lineHeight}px}
.resource-kind{flex-shrink:0;max-width:30%;font-size:${sm.fontSize}px;line-height:${sm.lineHeight}px;font-weight:600;color:${colors.muted}}
.resource-body{display:flex;flex-direction:column;gap:4px;min-width:0}
.resource-heading{font-weight:500}
.resource-heading a{color:inherit;text-decoration:none}
.export-image{display:flex;flex-direction:column;gap:8px;min-width:0}
img{display:block;max-width:100%;height:auto;object-fit:contain;border-radius:12px;margin:0}
.image-unavailable{display:block;padding:12px;border-radius:12px;background:${colors.secondary};color:${colors.muted};font-size:${sm.fontSize}px;line-height:${sm.lineHeight}px}
pre,code{font-family:"GeistMono-Regular","SFMono-Regular",Consolas,monospace;font-size:${sm.fontSize}px;line-height:${sm.lineHeight}px;tab-size:2}
code{background:${colors.inlineCode};color:${colors.inlineCodeForeground};border-radius:4px;padding:2px 4px}
.code-block{display:flex;flex-direction:column;height:192px;min-width:0;overflow:hidden;background:${colors.codeBlock};border-radius:8px}
.code-heading{display:flex;flex-shrink:0;justify-content:space-between;gap:12px;padding:10px 14px;border-bottom:1px solid ${colors.border};font-size:${sm.fontSize}px;line-height:${sm.lineHeight}px;font-weight:500}
pre{margin:0;padding:14px;white-space:pre;overflow-x:auto}
.code-block pre{flex:1;min-height:0;overflow:auto}
pre code{color:${colors.foreground};background:transparent;border:0;padding:0}
.table-scroll{max-width:100%;overflow-x:auto;border:1px solid ${colors.border};border-radius:8px}
table{width:100%;border-spacing:0;margin:0;font-size:${sm.fontSize}px;line-height:${sm.lineHeight}px}
td,th{min-width:0;padding:9px 10px;text-align:left;vertical-align:top;overflow-wrap:anywhere}
th{background:${colors.secondary};font-weight:600}
tr+tr>*,thead+tbody tr:first-child>*{border-top:1px solid ${colors.border}}
td+td,th+th{border-left:1px solid ${colors.subtleBorder}}
.html-document td,.html-document th{min-width:5em}
blockquote{padding:0 0 0 12px;border-left:2px solid ${colors.border};color:${colors.muted}}
blockquote>:last-child{margin-bottom:0}
hr{border:0;border-top:1px solid ${colors.border}}
ul,ol{padding-left:24px}li+li{margin-top:6px}li>p{margin-bottom:6px}li>ul,li>ol{margin-top:6px;margin-bottom:0}
details{min-width:0}
summary{display:flex;align-items:center;gap:8px;min-height:40px;list-style:none;cursor:pointer;color:${colors.muted};font-size:${sm.fontSize}px;line-height:${sm.lineHeight}px}
summary::-webkit-details-marker{display:none}
summary::after{content:"";width:6px;height:6px;border-top:1.5px solid currentColor;border-right:1.5px solid currentColor;transform:rotate(45deg);flex-shrink:0}
details[open]>summary::after{transform:rotate(135deg)}
.process{border-bottom:1px solid ${colors.subtleBorder};padding-bottom:12px}
.details-content{display:flex;flex-direction:column;gap:12px;border-left:2px solid ${colors.border};padding-left:12px;margin-top:8px}
details:not([open])>.details-content{display:none}
.process-step{font-size:${sm.fontSize}px;line-height:${sm.lineHeight}px;color:${colors.muted};padding:4px 0}
.references{display:flex;align-items:center;gap:6px;min-width:0;font-size:${sm.fontSize}px;line-height:${sm.lineHeight}px;font-weight:500;color:${colors.muted}}
.reference-icon{display:block;flex-shrink:0;width:16px;height:16px}
.formula-block{display:block;max-width:100%;overflow-x:auto;padding:12px 0}
.formula-inline{max-width:100%}math[display="block"]{margin:0;text-align:center}
.formula-fallback{white-space:pre-wrap;overflow-wrap:anywhere}
${
  imageFrame
    ? `
.image-print{background:${imageFrame.background}}
.image-print .code-block pre{overflow:hidden}
.image-print .table-scroll{overflow:visible}
.image-print table{table-layout:fixed}
.image-print td,.image-print th{min-width:0;padding:8px}
.image-print .formula-block{overflow:visible}
.image-print summary{cursor:default}
.image-print summary::after{display:none}
`
    : ''
}
${
  signature
    ? `
.print-signature{display:flex;align-items:center;gap:${size(footer.columnGap)}px;min-height:${size(footer.minHeight)}px;padding:${size(footer.paddingY)}px ${size(footer.paddingX)}px;background:${signature.background};color:${signature.foreground};font-size:${size(footer.primarySize)}px;line-height:${size(footer.primaryLineHeight)}px}
.print-identity{display:flex;align-items:center;gap:${size(footer.detailGap)}px;min-width:0;flex:1}
.print-brand{min-width:0;font-size:inherit;line-height:inherit}
.print-timestamp{min-width:0;flex:1;text-align:right}
img.print-logo{width:${size(footer.logoSize)}px;height:${size(footer.logoSize)}px;flex-shrink:0;border-radius:0;margin:0}
.print-secondary{font-size:${size(footer.secondarySize)}px;line-height:${size(footer.secondaryLineHeight)}px;opacity:${footer.secondaryOpacity};font-variant-numeric:tabular-nums}
`
    : ''
}`;
}
