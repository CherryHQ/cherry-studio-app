import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const SCAN_ROOTS = ['docs', 'src', 'packages', 'scripts', 'migrations'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', 'build', 'coverage', 'dist', 'out']);

// Synced third-party skill documentation under .agents is intentionally outside project ownership.
const MARKDOWN_LINK_RE = /!?\[[^\]]*\]\(([^)]+)\)/g;

interface BrokenLink {
  file: string;
  line: number;
  link: string;
  resolvedPath: string;
}

function findMarkdownFiles(directory: string): string[] {
  const files: string[] = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        files.push(...findMarkdownFiles(fullPath));
      }
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

function parseRelativeTarget(rawLink: string): string | null {
  const trimmed = rawLink.trim();
  const target = trimmed.startsWith('<')
    ? trimmed.slice(1, trimmed.indexOf('>'))
    : trimmed.split(/\s+/u, 1)[0];

  if (
    !target ||
    target.startsWith('#') ||
    target.startsWith('/') ||
    target.startsWith('//') ||
    /^[a-z][a-z\d+.-]*:/iu.test(target)
  ) {
    return null;
  }

  const pathOnly = target.split(/[?#]/u, 1)[0];
  if (!pathOnly) {
    return null;
  }

  try {
    return decodeURIComponent(pathOnly);
  } catch {
    return pathOnly;
  }
}

function checkFile(filePath: string): BrokenLink[] {
  const brokenLinks: BrokenLink[] = [];
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    MARKDOWN_LINK_RE.lastIndex = 0;

    let match = MARKDOWN_LINK_RE.exec(line);
    while (match !== null) {
      const rawLink = match[1];
      const relativeTarget = parseRelativeTarget(rawLink);
      if (relativeTarget) {
        const resolvedPath = path.resolve(path.dirname(filePath), relativeTarget);
        if (!fs.existsSync(resolvedPath)) {
          brokenLinks.push({
            file: path.relative(ROOT, filePath),
            line: index + 1,
            link: rawLink,
            resolvedPath: path.relative(ROOT, resolvedPath),
          });
        }
      }

      match = MARKDOWN_LINK_RE.exec(line);
    }
  }

  return brokenLinks;
}

function collectMarkdownFiles(): string[] {
  const files = SCAN_ROOTS.flatMap((directory) => {
    const absolutePath = path.join(ROOT, directory);
    return fs.existsSync(absolutePath) ? findMarkdownFiles(absolutePath) : [];
  });

  for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(path.join(ROOT, entry.name));
    }
  }

  return [...new Set(files)].sort();
}

function main() {
  const files = collectMarkdownFiles();
  const brokenLinks = files.flatMap(checkFile);

  if (brokenLinks.length === 0) {
    console.log(`Documentation link check passed (${files.length} Markdown files).`);
    return;
  }

  console.error(`Documentation link check failed (${brokenLinks.length} broken links):`);
  for (const brokenLink of brokenLinks) {
    console.error(`\n${brokenLink.file}:${brokenLink.line}`);
    console.error(`  Link: ${brokenLink.link}`);
    console.error(`  Resolved to: ${brokenLink.resolvedPath}`);
  }
  process.exitCode = 1;
}

main();
