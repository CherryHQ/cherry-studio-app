import fflate from './vendor/fflate.json';
import xmldom from './vendor/xmldom.json';

export const officeTextEncoderCode = String.raw`
// QuickJS has no TextEncoder; use one UTF-8 encoder for generation and package patching.
globalThis.TextEncoder = class {
  encode(value = '') {
    const utf8 = unescape(encodeURIComponent(String(value).replace(/[\ud800-\udfff]/gu, '\ufffd')));
    return Uint8Array.from(utf8, character => character.charCodeAt(0));
  }
};
`;

/** Only these pinned, app-owned modules can resolve inside a compute job. */
export const officeZipLibraryCode = `
const zip = (() => { const module = { exports: {} }; const exports = module.exports;
${fflate.assets['umd/index.js'].code}
return module.exports; })();`;

const factories = Object.entries(xmldom.assets)
  .map(
    ([path, asset]) =>
      `${JSON.stringify('./' + path.slice(4, -3))}: (require, module, exports) => {\n${asset.code}\n}`,
  )
  .join(',\n');

export const officeXmlLibraryCode = `
const xml = (() => {
  const factories = { ${factories} };
  const cache = Object.create(null);
  const require = name => {
    if (!Object.prototype.hasOwnProperty.call(factories, name)) throw new Error('Unknown Office XML module.');
    if (!cache[name]) { const module = { exports: {} }; cache[name] = module; factories[name](require, module, module.exports); }
    return cache[name].exports;
  };
  return require('./index');
})();`;
