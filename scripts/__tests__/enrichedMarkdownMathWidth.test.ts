import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const patchPath = 'patches/react-native-enriched-markdown@1.1.1.patch';
const patch = readFileSync(patchPath, 'utf8');
const attachmentFile = 'ios/attachments/ENRMMathInlineAttachment.m';
const attachmentHeaderFile = 'ios/attachments/ENRMMathInlineAttachment.h';
const rendererFile = 'ios/renderer/ENRMMathInlineRenderer.m';
const rendererHeaderFile = 'ios/renderer/ENRMMathInlineRenderer.h';
const factoryFile = 'ios/renderer/RendererFactory.m';
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
    expect(lockfile).toContain(`  react-native-enriched-markdown@1.1.1: ${hash}\n`);
  });

  test('executes the display-only column fit policy from the native patch', () => {
    const added = filePatch(attachmentFile)
      ?.split('\n')
      .filter((line) => line.startsWith('+'))
      .map((line) => line.slice(1))
      .join('\n');
    const block = added?.split('// CHERRY-MATH-FIT-BEGIN\n')[1]?.split('// CHERRY-MATH-FIT-END')[0];
    if (!block) throw new Error('Missing CHERRY-MATH-FIT block');
    expect(block).not.toMatch(/position|lineFragment/);

    const cases = [
      [240, 0, 0, 86, 1, 240, 1],
      [320, 40, 0, 500, 1, 280, 0.56],
      [240, 0, 0, 300, 1, 240, 0.8],
      [240, 0, 5, 300, 1, 235, 235 / 300],
      [0, 0, 0, 86, 1, 0, 1],
      [240, 0, 0, 0, 1, 240, 1],
      [240, 0, 0, 86, 0, 240, 1],
      [280, 0, 0, 500, 0, 280, 1],
    ];
    const directory = mkdtempSync(join(tmpdir(), 'enriched-math-fit-'));
    try {
      const sourcePath = join(directory, 'fit.c');
      const binaryPath = join(directory, 'fit');
      writeFileSync(
        sourcePath,
        `${block}
#include <stdio.h>
int main(void)
{
  const double cases[][5] = {
    ${cases.map((row) => `{${row.slice(0, 5).join(', ')}}`).join(',\n    ')}
  };
  for (unsigned int i = 0; i < sizeof(cases) / sizeof(cases[0]); i++) {
    const double *row = cases[i];
    double column = ENRMMathColumnWidth(row[0], row[1], row[2]);
    double scale = ENRMMathFitScale(row[3], column, (int)row[4]);
    printf("%.17g %.17g %.17g %.17g %.17g %.17g %.17g\\n", row[0], row[1], row[2], row[3], row[4], column, scale);
  }
  return 0;
}
`,
      );
      const args = [sourcePath, '-o', binaryPath];
      try {
        execFileSync('cc', args);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        execFileSync('clang', args);
      }
      const rows = execFileSync(binaryPath, { encoding: 'utf8' })
        .trim()
        .split('\n')
        .map((line) => line.split(' ').map(Number));
      expect(rows).toHaveLength(cases.length);
      rows.forEach((row, index) => {
        expect(row).toHaveLength(cases[index].length);
        row.forEach((value, column) => expect(value).toBeCloseTo(cases[index][column], 6));
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test('wires only nested display attachments to the usable paragraph column', () => {
    const source = afterSide(attachmentFile);
    expect(source).toContain('CGFloatavailableWidth=_cachedSize.width;');
    expect(source).toContain(
      'availableWidth=ENRMMathColumnWidth(right,indent,textContainer.lineFragmentPadding);',
    );
    expect(source).toContain(
      'if(!self.displayMath)returnCGRectMake(0,-_mathDescent,_cachedSize.width,_cachedSize.height);',
    );
    expect(source).toContain(
      'CGFloatscale=ENRMMathFitScale(_cachedSize.width,availableWidth,self.displayMath);',
    );
    expect(source).toContain(
      'returnCGRectMake(0,-_mathDescent*scale,_cachedSize.width*scale,_cachedSize.height*scale);',
    );
    expect(source).not.toContain('fragmentBudget');
    expect(source).not.toContain('containerBudget');
    expect(source).not.toContain('MAX(position.x');
    expect(afterSide(attachmentHeaderFile)).toContain(
      '@property(nonatomic,assign)BOOLdisplayMath;',
    );
    expect(afterSide(rendererFile)).toContain('attachment.displayMath=self.displayMath;');
    expect(afterSide(rendererHeaderFile)).toContain('@property(nonatomic,assign)BOOLdisplayMath;');
    const factory = afterSide(factoryFile);
    expect(factory).toContain('renderer.displayMath=YES;');
    expect(factory.match(/caseMarkdownNodeTypeLatexMathInline:/g)).toHaveLength(1);
    expect(factory).toContain(
      'caseMarkdownNodeTypeLatexMathInline:return[[ENRMMathInlineRendereralloc]initWithRendererFactory:selfconfig:_config];',
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

  test('relies on upstream list items flooring rather than capping their line height', () => {
    expect(filePatch('ios/renderer/ListItemRenderer.m')).toBeUndefined();
    const source = compact(
      readFileSync(
        'node_modules/react-native-enriched-markdown/ios/renderer/ListItemRenderer.m',
        'utf8',
      ),
    );
    expect(source).toContain('if(lineHeightConfig>0){style.minimumLineHeight=lineHeightConfig;}');
    expect(source).not.toContain('maximumLineHeight');
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
    expect(filePatch('ios/renderer/ENRMMathInlineRenderer.m')).toBeDefined();
    expect(filePatch('ios/utils/MarkdownExtractor.m')).toBeUndefined();
    expect(filePatch('ios/segments/ENRMMathContainerView.m')).toBeUndefined();
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
