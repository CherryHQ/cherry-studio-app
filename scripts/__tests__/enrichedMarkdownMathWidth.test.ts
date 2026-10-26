import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const patchPath = 'patches/react-native-enriched-markdown@1.0.1.patch';
const patch = readFileSync(patchPath, 'utf8');
const attachmentFile = 'ios/attachments/ENRMMathInlineAttachment.m';
const filePatch = (file: string) => patch.split(`+++ b/${file}\n`)[1]?.split('diff --git ')[0];
const compact = (source: string) => source.replace(/\s+/g, '');
const afterSide = (file: string) => {
  const section = filePatch(file);
  if (!section) throw new Error(`Missing native patch section: ${file}`);
  return compact(
    section
      .split('\n')
      .filter((line) => line.startsWith(' ') || line.startsWith('+'))
      .map((line) => line.slice(1))
      .join('\n'),
  );
};

// Static wiring guards do not execute TextKit layout or establish device rendering.
describe('Enriched Markdown iOS math width patch', () => {
  test('pins the patch with its current lockfile digest', () => {
    const hash = createHash('sha256').update(patch).digest('hex');
    const lockfile = readFileSync('pnpm-lock.yaml', 'utf8');
    expect(lockfile).toContain(`  react-native-enriched-markdown@1.0.1: ${hash}\n`);
  });

  test('caps against both the remaining fragment and the container with paragraph margins', () => {
    const source = afterSide(attachmentFile);
    expect(source).toContain('CGFloatpadding=textContainer?textContainer.lineFragmentPadding:0;');
    expect(source).toContain(
      'CGFloatfragmentBudget=lineFragment.size.width-MAX(position.x,0)-padding;',
    );
    expect(source).toContain('CGFloatavailableWidth=fragmentBudget;if(textContainer){');
    expect(source).toContain('NSTextStorage*storage=textContainer.layoutManager.textStorage;');
    expect(source).toContain('storage&&characterIndex<storage.length?');
    expect(source).toContain(
      '[storageattribute:NSParagraphStyleAttributeNameatIndex:characterIndexeffectiveRange:NULL]',
    );
    expect(source).toContain('CGFloatglyphX=lineFragment.origin.x+position.x;');
    expect(source).toContain('CGFloatindent=MAX(style.firstLineHeadIndent,style.headIndent);');
    expect(source).toContain(
      'CGFloatright=style.tailIndent>0?style.tailIndent:textContainer.size.width+style.tailIndent;',
    );
    expect(source).toContain('CGFloatcontainerBudget=right-MAX(glyphX,indent)-padding;');
    expect(source).toContain('availableWidth=MIN(fragmentBudget,containerBudget);');
    expect(source).toContain('availableWidth=MAX(0,availableWidth);');
    expect(source).toContain(
      'CGFloatscale=_cachedSize.width>0?MIN(1,availableWidth/_cachedSize.width):1;',
    );
    expect(source).toContain(
      'returnCGRectMake(0,-_mathDescent*scale,_cachedSize.width*scale,_cachedSize.height*scale);',
    );
  });

  test('sizes the raster from the current image bounds and rejects empty dimensions first', () => {
    const source = afterSide(attachmentFile).split('imageForBounds:')[1];
    expect(source).toBeDefined();
    expect(source).toContain(
      'if(imageBounds.size.width<=0||imageBounds.size.height<=0||_cachedSize.width<=0||_cachedSize.height<=0)returnnil;',
    );
    expect(source).toContain(
      'CGFloatscale=MIN(1,MIN(imageBounds.size.width/_cachedSize.width,imageBounds.size.height/_cachedSize.height));',
    );
    expect(source).toContain(
      'CGSizedrawSize=CGSizeMake(_cachedSize.width*scale,_cachedSize.height*scale);',
    );
    expect(source).toContain('initWithSize:drawSizeformat:format');
    expect(source.indexOf('returnnil;')).toBeLessThan(source.indexOf('UIGraphicsImageRenderer*'));
  });

  test('uses one uniform CTM for both RaTeX and the intrinsic fallback rectangle', () => {
    const source = afterSide(attachmentFile);
    expect(source.match(/CGContextScaleCTM\(/g)).toHaveLength(1);
    expect(source).toContain(
      'CGContextRefctx=rendererContext.CGContext;CGContextSaveGState(ctx);CGContextScaleCTM(ctx,scale,scale);if(_renderResult){[_renderResultdrawIn:ctx];}else{[_fallbackSourcedrawWithRect:CGRectMake(0,0,_cachedSize.width,_cachedSize.height)options:NSStringDrawingUsesLineFragmentOrigincontext:nil];}CGContextRestoreGState(ctx);',
    );
  });

  test('reuses the scoped math-aware list height helper only on iOS after applying attributes', () => {
    const source = afterSide('ios/renderer/ListItemRenderer.m');
    expect(source).toContain(
      '#ifTARGET_OS_OSXif(lineHeightConfig>0){style.minimumLineHeight=lineHeightConfig;style.maximumLineHeight=ENRMRangeContainsBlockImage(output,range)?0:lineHeightConfig;}#endif',
    );
    expect(source).toContain(
      'attributesToApply[NSParagraphStyleAttributeName]=style;[outputaddAttributes:attributesToApplyrange:range];#if!TARGET_OS_OSX',
    );
    expect(source).toContain('applyLineHeight(output,range,lineHeightConfig);#endif};');
    expect(source.match(/applyLineHeight\(/g)).toHaveLength(1);
  });

  test('preserves intrinsic metrics, stored LaTeX, and the iOS-only attachment boundary', () => {
    const section = filePatch(attachmentFile);
    expect(section).toBeDefined();
    const changed = compact(
      section!
        .split('\n')
        .filter((line) => /^[+-]/.test(line))
        .map((line) => line.slice(1))
        .join('\n'),
    );
    expect(changed).not.toMatch(
      /_cachedSize(?:\.\w+)?[+*/-]?=|_mathAscent=|_mathDescent=|boxHeight|latex=|#if|#endif/,
    );
    const intrinsic = compact(
      readFileSync(`node_modules/react-native-enriched-markdown/${attachmentFile}`, 'utf8'),
    );
    expect(intrinsic).toContain('return_cachedSize.height;');
    expect(intrinsic).toContain(
      '_cachedSize=CGSizeMake(ceil(result.width),ceil(result.totalHeight));',
    );
    expect(intrinsic).toContain(
      '_cachedSize=CGSizeMake(ceil(bounds.size.width),ceil(_mathAscent+_mathDescent));',
    );
    expect(intrinsic).toContain('#if!TARGET_OS_OSX-(void)prepareIfNeeded');
    const renderer = compact(
      readFileSync(
        'node_modules/react-native-enriched-markdown/ios/renderer/ENRMMathInlineRenderer.m',
        'utf8',
      ),
    );
    expect(renderer).toContain('attachment.latex=latex;');
    expect(filePatch('ios/renderer/ENRMMathInlineRenderer.m')).toBeUndefined();
    expect(filePatch('ios/utils/MarkdownExtractor.m')).toBeUndefined();
    expect(filePatch('ios/views/ENRMMathContainerView.m')).toBeUndefined();
  });

  test('keeps Android math changes limited to the existing screen-reader compatibility fix', () => {
    const sections = patch.split(/^(?=diff --git )/m).filter((section) => {
      const file = /^diff --git a\/(\S+)/.exec(section)?.[1];
      return file?.startsWith('android/') && /math/i.test(file);
    });
    expect(sections).toHaveLength(1);
    const changes = sections[0]
      .split('\n')
      .filter((line) => /^[+-](?![+-])/.test(line))
      .map(compact);
    expect(changes).toEqual([
      '+importandroidx.core.view.ViewCompat',
      '-isScreenReaderFocusable=true',
      '+ViewCompat.setScreenReaderFocusable(this,true)',
    ]);
  });
});
