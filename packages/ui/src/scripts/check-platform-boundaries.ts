import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import ts from 'typescript';

/**
 * Enforce only mechanically decidable UI boundaries. Whether a platform split is truly imposed is
 * a design-review decision documented in docs/references/ui-components.md.
 */
const repoRoot = path.resolve(import.meta.dirname, '../../../..');
const appSourceRoot = path.join(repoRoot, 'src');
const uiSourceRoot = path.join(repoRoot, 'packages/ui/src');

// Add a package here when it becomes a platform UI implementation dependency. Product source must
// then use a CherryUI wrapper or a narrow, documented semantic-gateway exemption.
const platformUiPackages = ['@expo/ui', 'expo-glass-effect', 'heroui-native'];

/**
 * App-shell and semantic-gateway imports that intentionally sit outside CherryUI.
 * Every exemption names the boundary it owns. Stale entries fail this check.
 */
const platformImportExemptions: Record<string, Record<string, string>> = {
  'src/app/_layout.tsx': {
    'heroui-native/provider':
      'app root host: mounts the provider once around the complete application tree',
  },
  'src/frontend/utils/constants.ts': {
    'expo-glass-effect':
      'navigation gateway: exposes one capability boolean without leaking provider types',
  },
};

type ModuleReference = {
  line: number;
  specifier: string;
};

async function listTypeScriptFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listTypeScriptFiles(absolutePath)));
    } else if (/\.tsx?$/.test(entry.name)) {
      files.push(absolutePath);
    }
  }

  return files;
}

function isTestFile(relativePath: string): boolean {
  return /(?:^|\/)__tests__\//.test(relativePath) || /\.test\.tsx?$/.test(relativePath);
}

function isPackageImport(specifier: string, packageName: string): boolean {
  return specifier === packageName || specifier.startsWith(`${packageName}/`);
}

function isInside(candidate: string, parent: string): boolean {
  const relativePath = path.relative(parent, candidate);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function normalizeModuleStem(modulePath: string): string {
  return modulePath
    .replace(/\.(?:ts|tsx)$/, '')
    .replace(/\.(?:ios|android)$/, '')
    .replace(/\.types$/, '');
}

function getStringArgument(node: ts.CallExpression): ts.StringLiteralLike | undefined {
  const [argument] = node.arguments;
  if (!argument || !ts.isStringLiteralLike(argument)) return undefined;

  const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
  const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
  return isDynamicImport || isRequire ? argument : undefined;
}

function createSourceFile(file: string, source: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function getModuleReferences(file: string, source: string): ModuleReference[] {
  const sourceFile = createSourceFile(file, source);
  const references: ModuleReference[] = [];

  function addReference(moduleSpecifier: ts.StringLiteralLike) {
    const { line } = sourceFile.getLineAndCharacterOfPosition(moduleSpecifier.getStart(sourceFile));
    references.push({ line: line + 1, specifier: moduleSpecifier.text });
  }

  function visit(node: ts.Node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      addReference(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      addReference(node.moduleReference.expression);
    } else if (ts.isCallExpression(node)) {
      const argument = getStringArgument(node);
      if (argument) addReference(argument);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return references;
}

function getReexportReferences(file: string, source: string): ModuleReference[] {
  const sourceFile = createSourceFile(file, source);
  const references: ModuleReference[] = [];

  sourceFile.forEachChild((node) => {
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(
        node.moduleSpecifier.getStart(sourceFile),
      );
      references.push({ line: line + 1, specifier: node.moduleSpecifier.text });
    }
  });

  return references;
}

async function readPublicUiImports(): Promise<Set<string>> {
  const packageJson = JSON.parse(
    await readFile(path.join(repoRoot, 'packages/ui/package.json'), 'utf8'),
  ) as { exports: Record<string, unknown> };

  return new Set(
    Object.keys(packageJson.exports).map((exportPath) =>
      exportPath === '.' ? '@cherrystudio/ui' : `@cherrystudio/ui/${exportPath.slice(2)}`,
    ),
  );
}

async function checkAppImports() {
  const publicUiImports = await readPublicUiImports();
  const violations: string[] = [];
  const usedExemptions = new Set<string>();

  for (const file of await listTypeScriptFiles(appSourceRoot)) {
    const relativePath = path.relative(repoRoot, file);
    if (isTestFile(relativePath)) continue;

    const source = await readFile(file, 'utf8');
    for (const { line, specifier } of getModuleReferences(file, source)) {
      const exemptionReason = platformImportExemptions[relativePath]?.[specifier];
      if (exemptionReason) {
        usedExemptions.add(`${relativePath}:${specifier}`);
        continue;
      }

      if (platformUiPackages.some((packageName) => isPackageImport(specifier, packageName))) {
        violations.push(
          `${relativePath}:${line} imports ${specifier}; use a CherryUI component or register a semantic gateway exemption`,
        );
      }

      if (specifier === '@cherrystudio/ui') {
        violations.push(
          `${relativePath}:${line} imports the CherryUI root; use /components or another explicit package export`,
        );
      } else if (
        isPackageImport(specifier, '@cherrystudio/ui') &&
        !publicUiImports.has(specifier)
      ) {
        violations.push(
          `${relativePath}:${line} imports private CherryUI path ${specifier}; use a package export`,
        );
      }

      if (specifier.startsWith('.')) {
        const resolvedImport = path.resolve(path.dirname(file), specifier);
        if (isInside(resolvedImport, uiSourceRoot)) {
          violations.push(
            `${relativePath}:${line} reaches into packages/ui/src; use @cherrystudio/ui/components`,
          );
        }
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `[ui-boundaries] product source bypasses the public UI boundary:\n${violations.join('\n')}`,
    );
  }

  const staleExemptions = Object.entries(platformImportExemptions).flatMap(
    ([relativePath, imports]) =>
      Object.keys(imports)
        .filter((specifier) => !usedExemptions.has(`${relativePath}:${specifier}`))
        .map((specifier) => `${relativePath}: ${specifier}`),
  );
  if (staleExemptions.length > 0) {
    throw new Error(
      `[ui-boundaries] platform import exemptions no longer match source:\n${staleExemptions.join('\n')}`,
    );
  }
}

async function checkPrivateAdapters() {
  const files = await listTypeScriptFiles(uiSourceRoot);
  const productionFiles = files.filter((file) => !isTestFile(path.relative(repoRoot, file)));
  const fileSet = new Set(productionFiles);
  const adapterFamilies = new Map<string, string[]>();
  const violations: string[] = [];

  for (const file of productionFiles) {
    const match = file.match(/^(.*-(?:control|frame))\.(?:ios|android)\.(?:ts|tsx)$/);
    if (!match) continue;

    const familyStem = match[1];
    const members = adapterFamilies.get(familyStem) ?? [];
    members.push(file);
    adapterFamilies.set(familyStem, members);
  }

  for (const [familyStem, members] of adapterFamilies) {
    const hasFallback = fileSet.has(`${familyStem}.ts`) || fileSet.has(`${familyStem}.tsx`);
    const hasSharedTypes =
      fileSet.has(`${familyStem}.types.ts`) || fileSet.has(`${familyStem}.types.tsx`);
    const familyName = path.basename(familyStem);
    const memberList = members.map((file) => path.relative(repoRoot, file)).join(', ');

    if (!hasFallback) {
      violations.push(
        `${memberList} has no extensionless fallback; add ${familyName}.ts(x) for Web and tooling`,
      );
    }
    if (!hasSharedTypes) {
      violations.push(`${memberList} has no shared adapter props; add ${familyName}.types.ts`);
    }
  }

  for (const file of productionFiles) {
    if (!/^index\.tsx?$/.test(path.basename(file))) continue;

    const relativePath = path.relative(repoRoot, file);
    const source = await readFile(file, 'utf8');

    for (const { line, specifier } of getReexportReferences(file, source)) {
      if (!specifier.startsWith('.')) continue;

      const reexportStem = normalizeModuleStem(path.resolve(path.dirname(file), specifier));
      if (adapterFamilies.has(reexportStem)) {
        violations.push(
          `${relativePath}:${line} re-exports private adapter module ${specifier}; export only the shared component contract`,
        );
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `[ui-boundaries] invalid private platform adapter family:\n${violations.join('\n')}`,
    );
  }
}

async function main() {
  await checkAppImports();
  await checkPrivateAdapters();
  process.stdout.write('UI platform boundaries are current.\n');
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
