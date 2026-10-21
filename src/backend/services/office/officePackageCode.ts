import fflate from './vendor/fflate.json';
import xmldom from './vendor/xmldom.json';

/** Largest Office source or output file; see the README for the measured memory behind it. */
export const OFFICE_MAX_FILE_BYTES = 64 * 1024 * 1024;

const MAIN_PARTS = {
  docx: 'word/document.xml',
  xlsx: 'xl/workbook.xml',
  pptx: 'ppt/presentation.xml',
};

// Byte/string conversions use indexed loops: QuickJS materializes `Uint8Array.from(string, fn)`
// as an array of one-character strings first, about 70 bytes of heap per input byte.
const officeBytesCode = String.raw`
const bytesOf = binary => {
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
};
const base64Of = bytes => {
  const chunks = [];
  for (let index = 0; index < bytes.length; index += 0x8000) chunks.push(String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000)));
  return btoa(chunks.join(''));
};
// QuickJS has no TextEncoder; use one UTF-8 encoder for generation and package patching.
globalThis.TextEncoder = class {
  encode(value = '') {
    return bytesOf(unescape(encodeURIComponent(String(value).replace(/[\ud800-\udfff]/gu, '�'))));
  }
};
`;

/**
 * Only these pinned, app-owned modules can resolve inside a compute job. `zip.zipSync` stores
 * already-compressed media by default: deflating them saves nothing and dominates packing time.
 */
const officeZipLibraryCode = `
const zip = (() => { const module = { exports: {} }; const exports = module.exports;
${fflate.assets['umd/index.js'].code}
const library = module.exports;
const media = /[.](?:jpe?g|png|gif|webp|wdp|jxr|tiff?|mp3|m4a|wav|mp4|m4v|mov)$/i;
return { ...library, zipSync: (data, options) => library.zipSync(Object.fromEntries(Object.entries(data).map(([name, value]) =>
  [name, value instanceof Uint8Array && media.test(name) ? [value, { level: 0 }] : value])), options) };
})();`;

const factories = Object.entries(xmldom.assets)
  .map(
    ([path, asset]) =>
      `${JSON.stringify('./' + path.slice(4, -3))}: (require, module, exports) => {\n${asset.code}\n}`,
  )
  .join(',\n');

const officeXmlLibraryCode = `
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

/**
 * Takes the host's `__files` before any other code runs and keeps it in a closure, so later code,
 * including a model script, only sees `readInput(index)`, which returns an input file's bytes read
 * once, and `saveOffice(output, format, checkXml)`, which validates and writes the finished package
 * and returns its size. Requires the byte, ZIP and XML code above.
 */
const officeFilesCode = String.raw`
const { readInput, saveOffice } = (() => {
  const files = globalThis.__files;
  delete globalThis.__files;
  // One copy per input: repeated uses share it, which also lets libraries deduplicate media.
  const loaded = [];
  const mebibytes = size => (size / 1048576).toFixed(1) + ' MiB';
  const readInput = index => loaded[index] ??= new Uint8Array(files.read(index));
  const saveOffice = (output, format, checkXml) => {
    const label = format.toUpperCase();
    let bytes;
    if (typeof output === 'string') {
      if (!output.startsWith('UEsD')) throw new Error('A returned string must be the base64 file, which starts with "UEsD". Return nothing to only inspect inputs.');
      bytes = bytesOf(atob(output));
    }
    else if (output instanceof ArrayBuffer) bytes = new Uint8Array(output);
    else if (ArrayBuffer.isView(output)) bytes = new Uint8Array(output.buffer, output.byteOffset, output.byteLength);
    else throw new Error('Return the ' + label + ' file as a Uint8Array, ArrayBuffer or base64 string.');
    if (bytes.length > ${OFFICE_MAX_FILE_BYTES}) throw new Error('The ' + label + ' file is ' + mebibytes(bytes.length) + ', over the ${OFFICE_MAX_FILE_BYTES / 1048576} MiB limit.');
    const main = ${JSON.stringify(MAIN_PARTS)}[format];
    let parts;
    try { parts = zip.unzipSync(bytes, { filter: entry => !checkXml ? entry.name === main : entry.name === main || /[.](xml|rels)$/.test(entry.name) && entry.originalSize <= 1048576 }); }
    catch { throw new Error('The returned value is not a ZIP package.'); }
    if (!parts[main]) throw new Error('The returned package is not a ' + label + ' file: ' + main + ' is missing.');
    // Hand-edited package XML is the common way to corrupt a file; refuse it before it is saved.
    // Parts over 1 MiB are skipped to keep large sheets within the run's memory and time budget.
    for (const [name, data] of checkXml ? Object.entries(parts) : []) {
      let problem;
      try {
        new xml.DOMParser({ onError: (level, message) => { if (level !== 'warning') problem ??= message; } })
          .parseFromString(zip.strFromU8(data), 'application/xml');
      } catch (error) { problem ??= String(error && error.message || error); }
      if (problem) throw new Error('Invalid XML in ' + name + ': ' + problem);
    }
    parts = undefined;
    return files.write(bytes);
  };
  return { readInput, saveOffice };
})();
`;

/** The full host prelude of an Office job, in dependency order. */
export const officeRuntimeCode = `${officeBytesCode}\n${officeZipLibraryCode}\n${officeXmlLibraryCode}\n${officeFilesCode}`;
