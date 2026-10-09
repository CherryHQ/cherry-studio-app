import { strToU8, Zip, ZipPassThrough } from 'fflate/browser';

const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml';
const WIDTH = 12_192_000;
const HEIGHT = 6_858_000;
const GROUP =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const COLOR_MAP =
  'accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"';

/** Image-only PresentationML. PNG chunks go directly into ZIP STORE, never through Base64. */
export function createImagePresentation(write: (chunk: Uint8Array) => void) {
  let count = 0;
  const zip = new Zip((error, chunk) => {
    if (error) throw error;
    write(chunk);
  });
  const xml = (path: string, value: string) => {
    const entry = new ZipPassThrough(path);
    zip.add(entry);
    entry.push(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${value}`), true);
  };
  return {
    addSlide(width: number, height: number) {
      const index = ++count;
      const scale = Math.min(WIDTH / width, HEIGHT / height);
      const cx = Math.round(width * scale);
      const cy = Math.round(height * scale);
      xml(
        `ppt/slides/slide${index}.xml`,
        `<p:sld xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${GROUP}<p:pic><p:nvPicPr><p:cNvPr id="2" name="Page ${index}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdImage"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${Math.round((WIDTH - cx) / 2)}" y="${Math.round((HEIGHT - cy) / 2)}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`,
      );
      xml(
        `ppt/slides/_rels/slide${index}.xml.rels`,
        relationships([
          ['rIdImage', 'image', `../media/image${index}.png`],
          ['rIdLayout', 'slideLayout', '../slideLayouts/slideLayout1.xml'],
        ]),
      );
      const image = new ZipPassThrough(`ppt/media/image${index}.png`);
      zip.add(image);
      return image;
    },
    finish() {
      xml(
        '_rels/.rels',
        relationships([['rIdPresentation', 'officeDocument', 'ppt/presentation.xml']]),
      );
      xml(
        'ppt/presentation.xml',
        `<p:presentation xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdMaster"/></p:sldMasterIdLst><p:sldIdLst>${Array.from({ length: count }, (_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${WIDTH}" cy="${HEIGHT}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
      );
      xml(
        'ppt/_rels/presentation.xml.rels',
        relationships([
          ['rIdMaster', 'slideMaster', 'slideMasters/slideMaster1.xml'],
          ['rIdProperties', 'presProps', 'presProps.xml'],
          ...Array.from({ length: count }, (_, i): [string, string, string] => [
            `rId${i + 1}`,
            'slide',
            `slides/slide${i + 1}.xml`,
          ]),
        ]),
      );
      xml('ppt/presProps.xml', `<p:presentationPr xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"/>`);
      xml(
        'ppt/slideMasters/slideMaster1.xml',
        `<p:sldMaster xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:cSld><p:spTree>${GROUP}</p:spTree></p:cSld><p:clrMap ${COLOR_MAP}/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rIdLayout"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`,
      );
      xml(
        'ppt/slideMasters/_rels/slideMaster1.xml.rels',
        relationships([
          ['rIdLayout', 'slideLayout', '../slideLayouts/slideLayout1.xml'],
          ['rIdTheme', 'theme', '../theme/theme1.xml'],
        ]),
      );
      xml(
        'ppt/slideLayouts/slideLayout1.xml',
        `<p:sldLayout xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${GROUP}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`,
      );
      xml(
        'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
        relationships([['rIdMaster', 'slideMaster', '../slideMasters/slideMaster1.xml']]),
      );
      xml('ppt/theme/theme1.xml', theme());
      const parts = [
        ['/ppt/presentation.xml', `${CONTENT_TYPE}.presentation.main+xml`],
        ['/ppt/presProps.xml', `${CONTENT_TYPE}.presProps+xml`],
        ['/ppt/slideMasters/slideMaster1.xml', `${CONTENT_TYPE}.slideMaster+xml`],
        ['/ppt/slideLayouts/slideLayout1.xml', `${CONTENT_TYPE}.slideLayout+xml`],
        ['/ppt/theme/theme1.xml', 'application/vnd.openxmlformats-officedocument.theme+xml'],
        ...Array.from({ length: count }, (_, i) => [
          `/ppt/slides/slide${i + 1}.xml`,
          `${CONTENT_TYPE}.slide+xml`,
        ]),
      ];
      xml(
        '[Content_Types].xml',
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>${parts.map(([name, type]) => `<Override PartName="${name}" ContentType="${type}"/>`).join('')}</Types>`,
      );
      zip.end();
    },
    cancel: () => zip.terminate(),
  };
}

function relationships(items: [string, string, string][]) {
  return `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(([id, type, target]) => `<Relationship Id="${id}" Type="${R}/${type}" Target="${target}"/>`).join('')}</Relationships>`;
}

function theme() {
  const colors = {
    dk1: '000000',
    lt1: 'FFFFFF',
    dk2: '000000',
    lt2: 'FFFFFF',
    accent1: '000000',
    accent2: '000000',
    accent3: '000000',
    accent4: '000000',
    accent5: '000000',
    accent6: '000000',
    hlink: '000000',
    folHlink: '000000',
  };
  const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  const font = '<a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/>';
  return `<a:theme xmlns:a="${A}" name="Image presentation"><a:themeElements><a:clrScheme name="Neutral">${Object.entries(
    colors,
  )
    .map(([name, value]) => `<a:${name}><a:srgbClr val="${value}"/></a:${name}>`)
    .join(
      '',
    )}</a:clrScheme><a:fontScheme name="Default"><a:majorFont>${font}</a:majorFont><a:minorFont>${font}</a:minorFont></a:fontScheme><a:fmtScheme name="Default"><a:fillStyleLst>${fill.repeat(3)}</a:fillStyleLst><a:lnStyleLst>${`<a:ln w="9525">${fill}<a:prstDash val="solid"/></a:ln>`.repeat(3)}</a:lnStyleLst><a:effectStyleLst>${'<a:effectStyle><a:effectLst/></a:effectStyle>'.repeat(3)}</a:effectStyleLst><a:bgFillStyleLst>${fill.repeat(3)}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
}
