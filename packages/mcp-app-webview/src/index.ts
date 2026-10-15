export type McpAppSandboxPolicy = {
  connectDomains: string[];
  resourceDomains: string[];
  /** Mobile currently denies nested frames, custom base URLs, and browser permissions. */
  frameDomains: [];
  baseUriDomains: [];
};

/** CSP origin tokens, not URLs that could smuggle additional directives. */
export function normalizeMcpAppDomains(value: unknown, websocket = false): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 32) throw new Error('Invalid MCP App domains.');
  return [
    ...new Set(
      value.map((item) => {
        if (
          typeof item !== 'string' ||
          item.length > 256 ||
          !/^(https|wss):\/\/(\*\.)?[a-zA-Z0-9.-]+(:\d{1,5})?$/.test(item)
        )
          throw new Error('Invalid MCP App domain.');
        const url = new URL(item.replace('://*.', '://'));
        if (
          (!websocket && url.protocol !== 'https:') ||
          !url.hostname.includes('.') ||
          url.hostname === 'localhost'
        )
          throw new Error('Invalid MCP App domain.');
        return item.toLowerCase();
      }),
    ),
  ];
}

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}
function scriptValue(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

/**
 * Native is the Host; this trusted shell forwards only the opaque-origin View's messages.
 * The nonce authenticates shell → native messages even on WebViews that inject a native bridge
 * into every frame. Untrusted HTML never enters the shell DOM or shares its origin.
 */
export function createMcpAppHtml(input: {
  html: string;
  nonce: string;
  policy: McpAppSandboxPolicy;
}): string {
  const resources = normalizeMcpAppDomains(input.policy.resourceDomains).join(' ');
  const connections =
    normalizeMcpAppDomains(input.policy.connectDomains, true).join(' ') || "'none'";
  const common = `default-src 'none'; script-src 'unsafe-inline' ${resources}; style-src 'unsafe-inline' ${resources}; img-src data: blob: ${resources}; font-src data: ${resources}; media-src data: blob: ${resources}; connect-src ${connections}; object-src 'none'; base-uri 'none'; form-action 'none';`;
  const outerCsp = `${common} frame-src blob:;`;
  const innerCsp = `${common} frame-src 'none';`;
  const viewHtml = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${escapeAttribute(innerCsp)}"><meta name="viewport" content="width=device-width,initial-scale=1">${input.html}`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${escapeAttribute(outerCsp)}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,iframe{margin:0;width:100%;height:100%;border:0;overflow:hidden}body{background:transparent}</style></head><body><script>
(function(){
'use strict';
const nonce=${scriptValue(input.nonce)};
const frame=document.createElement('iframe');
frame.setAttribute('sandbox','allow-scripts');
frame.setAttribute('allow',"camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; payment 'none'; fullscreen 'none'");
frame.setAttribute('referrerpolicy','no-referrer');
const source=URL.createObjectURL(new Blob([${scriptValue(viewHtml)}],{type:'text/html'}));
let disposed=false;
function native(message){if(!disposed)window.ReactNativeWebView.postMessage(JSON.stringify({nonce,message}));}
window.addEventListener('message',function(event){
  if(event.source!==frame.contentWindow || event.origin!=='null')return;
  const message=event.data;
  if(!message || typeof message!=='object' || message.jsonrpc!=='2.0' || (typeof message.method==='string' && message.method.startsWith('ui/notifications/sandbox-')))return;
  native(message);
});
window.__cherryMcpReceive=function(message){if(!disposed && frame.contentWindow)frame.contentWindow.postMessage(message,'*');};
window.__cherryMcpDispose=function(){disposed=true;frame.remove();URL.revokeObjectURL(source);};
frame.src=source;document.body.appendChild(frame);
})();
</script></body></html>`;
}
