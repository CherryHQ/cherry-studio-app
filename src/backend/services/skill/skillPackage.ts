/**
 * Pure package validation for `SKILL.md` packages.
 *
 * Input is the complete set of package files as bytes; output is either the
 * validated facts an installer commits or the validation issues a user sees.
 * Nothing here touches storage, the network, or the environment: package
 * validity is a property of the bytes alone, distinct from compatibility.
 */

import {
  SKILL_COMPATIBILITY_MAX_LENGTH,
  SKILL_DESCRIPTION_MAX_LENGTH,
  SKILL_ENTRY_FILENAME,
  SKILL_NAME_PATTERN,
  SKILL_NAME_MAX_LENGTH,
  SKILL_INSTRUCTIONS_MAX_CHARACTERS,
  type SkillInvocation,
  type SkillManifestEntry,
  type SkillPackageIssue,
} from '@/shared/data/types/skill';
import { sha256Hex, sha256HexOfText } from '@/shared/utils/sha256';

export const SKILL_PACKAGE_MAX_FILES = 200;
export const SKILL_PACKAGE_MAX_BYTES = 8 * 1024 * 1024;
export const SKILL_FILE_MAX_BYTES = 2 * 1024 * 1024;
export const SKILL_INSTRUCTIONS_PREVIEW_CHARACTERS = 1_200;

/** Package-relative POSIX path to file bytes. */
export type SkillPackageFiles = ReadonlyMap<string, Uint8Array>;

export type SkillFrontmatter = {
  name?: unknown;
  description?: unknown;
  license?: unknown;
  compatibility?: unknown;
  metadata?: unknown;
  'allowed-tools'?: unknown;
  'disable-model-invocation'?: unknown;
  'user-invocable'?: unknown;
  [key: string]: unknown;
};

export type ValidatedSkillPackage = {
  name: string;
  description: string;
  author: string | null;
  version: string | null;
  license: string | null;
  compatibility: string | null;
  tags: string[];
  invocation: SkillInvocation;
  /** Markdown after the frontmatter block. */
  instructions: string;
  frontmatter: SkillFrontmatter;
  manifest: SkillManifestEntry[];
  entryDigest: string;
  packageDigest: string;
};

export type SkillPackageValidation =
  | { ok: true; package: ValidatedSkillPackage }
  | { ok: false; issues: SkillPackageIssue[] };

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const SHELL_INTERPOLATION = /!`[^`]+`/;

export function validateSkillPackage(
  files: SkillPackageFiles,
  options: { expectedName?: string } = {},
): SkillPackageValidation {
  const issues: SkillPackageIssue[] = [];

  if (files.size > SKILL_PACKAGE_MAX_FILES) {
    issues.push({ code: 'too-many-files', subject: String(files.size) });
  }
  let totalBytes = 0;
  const normalizedPaths = new Set<string>();
  for (const [path, bytes] of files) {
    if (!isSafePackagePath(path)) {
      issues.push({ code: 'path-unsafe', subject: path });
      continue;
    }
    const folded = path.normalize('NFC').toLowerCase();
    if (normalizedPaths.has(folded)) {
      issues.push({ code: 'path-collision', subject: path });
    }
    normalizedPaths.add(folded);
    totalBytes += bytes.byteLength;
    if (bytes.byteLength > SKILL_FILE_MAX_BYTES) {
      issues.push({ code: 'file-too-large', subject: path });
    }
  }
  for (const path of normalizedPaths) {
    const segments = path.split('/');
    for (let length = 1; length < segments.length; length += 1) {
      if (normalizedPaths.has(segments.slice(0, length).join('/'))) {
        issues.push({ code: 'path-collision', subject: path });
        break;
      }
    }
  }
  if (totalBytes > SKILL_PACKAGE_MAX_BYTES) {
    issues.push({ code: 'package-too-large', subject: String(totalBytes) });
  }

  const entryBytes = files.get(SKILL_ENTRY_FILENAME);
  if (!entryBytes) {
    issues.push({ code: 'entry-missing', subject: SKILL_ENTRY_FILENAME });
    return { ok: false, issues };
  }
  const entryText = decodeUtf8(entryBytes);
  if (entryText === null) {
    issues.push({ code: 'frontmatter-invalid', subject: 'encoding' });
    return { ok: false, issues };
  }
  const parsed = parseSkillEntry(entryText);
  if (!parsed) {
    issues.push({ code: 'frontmatter-missing', subject: null });
    return { ok: false, issues };
  }
  if ('error' in parsed) {
    issues.push({ code: 'frontmatter-invalid', subject: parsed.error });
    return { ok: false, issues };
  }
  const { frontmatter, body } = parsed;
  if ([...body.trim()].length > SKILL_INSTRUCTIONS_MAX_CHARACTERS) {
    issues.push({ code: 'file-too-large', subject: SKILL_ENTRY_FILENAME });
  }
  for (const key of ['disable-model-invocation', 'user-invocable']) {
    if (frontmatter[key] !== undefined && typeof frontmatter[key] !== 'boolean') {
      issues.push({ code: 'frontmatter-invalid', subject: key });
    }
  }

  const name = typeof frontmatter.name === 'string' ? frontmatter.name.trim() : '';
  if (
    !name ||
    name.length > SKILL_NAME_MAX_LENGTH ||
    !SKILL_NAME_PATTERN.test(name) ||
    name !== name.normalize('NFC')
  ) {
    issues.push({ code: 'name-invalid', subject: name || null });
  } else if (options.expectedName !== undefined && options.expectedName !== name) {
    issues.push({ code: 'name-mismatch', subject: options.expectedName });
  }
  const description =
    typeof frontmatter.description === 'string' ? frontmatter.description.trim() : '';
  if (!description || description.length > SKILL_DESCRIPTION_MAX_LENGTH) {
    issues.push({ code: 'description-invalid', subject: null });
  }
  const compatibility = optionalString(frontmatter.compatibility);
  if (compatibility && compatibility.length > SKILL_COMPATIBILITY_MAX_LENGTH) {
    issues.push({ code: 'compatibility-too-long', subject: null });
  }
  for (const key of ['hooks', 'context', 'agent', 'model']) {
    if (frontmatter[key] !== undefined)
      issues.push({ code: 'unsupported-semantics', subject: key });
  }
  if (SHELL_INTERPOLATION.test(body)) {
    issues.push({ code: 'unsupported-semantics', subject: 'shell-interpolation' });
  }
  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const metadata = readMetadata(frontmatter.metadata);
  const manifest = [...files]
    .map(([path, bytes]) => ({ path, size: bytes.byteLength, digest: sha256Hex(bytes) }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return {
    ok: true,
    package: {
      name,
      description,
      author: metadata.author,
      version: metadata.version,
      license: optionalString(frontmatter.license),
      compatibility,
      tags: metadata.tags,
      invocation: {
        modelInvocable: frontmatter['disable-model-invocation'] !== true,
        userInvocable: frontmatter['user-invocable'] !== false,
      },
      instructions: body.trim(),
      frontmatter,
      manifest,
      entryDigest: sha256Hex(entryBytes),
      packageDigest: computePackageDigest(manifest),
    },
  };
}

export function computePackageDigest(manifest: readonly SkillManifestEntry[]): string {
  const canonical = [...manifest]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((entry) => `${entry.path}\n${entry.digest}\n`)
    .join('');
  return sha256HexOfText(canonical);
}

/** Bounded head of the instruction body for detail views. */
export function previewInstructions(instructions: string): string {
  const characters = [...instructions];
  return characters.length <= SKILL_INSTRUCTIONS_PREVIEW_CHARACTERS
    ? instructions
    : `${characters.slice(0, SKILL_INSTRUCTIONS_PREVIEW_CHARACTERS).join('')}…`;
}

/**
 * Package-relative POSIX paths only: no absolute paths, drive letters, `.`
 * or `..` segments, backslashes, empty segments, or control characters.
 */
export function isSafePackagePath(path: string): boolean {
  if (!path || path.length > 512 || CONTROL_CHARACTERS.test(path)) return false;
  if (path.startsWith('/') || path.includes('\\') || /^[a-zA-Z]:/.test(path)) return false;
  const segments = path.split('/');
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

export function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

type ParsedEntry = { frontmatter: SkillFrontmatter; body: string } | { error: string } | null;

/** Splits the leading `---` block from the body; returns null without a block. */
export function parseSkillEntry(text: string): ParsedEntry {
  const source = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const lines = source.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return null;
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (end === -1) return { error: 'unterminated' };
  const result = parseYamlSubset(lines.slice(1, end));
  if ('error' in result) return result;
  return { frontmatter: result.value as SkillFrontmatter, body: lines.slice(end + 1).join('\n') };
}

/**
 * The YAML subset the specification's frontmatter needs: scalar `key: value`
 * pairs, one nested mapping level (`metadata`), quoted strings, booleans,
 * numbers, and `|` / `>` block scalars. Anything else is a parse error rather
 * than a guess.
 */
function parseYamlSubset(
  lines: readonly string[],
): { value: Record<string, unknown> } | { error: string } {
  const root: Record<string, unknown> = {};
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    if (line.trim() === '' || line.trim().startsWith('#')) {
      index += 1;
      continue;
    }
    if (/^\s/.test(line)) return { error: `unexpected indentation at line ${index + 1}` };
    const match = /^([A-Za-z0-9_-]+):(.*)$/.exec(line);
    if (!match) return { error: `invalid key at line ${index + 1}` };
    const key = match[1]!;
    const rest = match[2]!.trim();
    if (Object.hasOwn(root, key)) return { error: `duplicate key ${key}` };
    index += 1;
    if (rest === '|' || rest === '>') {
      const block: string[] = [];
      while (index < lines.length && (/^\s/.test(lines[index]!) || lines[index]!.trim() === '')) {
        block.push(lines[index]!.replace(/^\s{1,2}/, ''));
        index += 1;
      }
      const text = block.join('\n').replace(/\s+$/, '');
      root[key] = rest === '|' ? text : text.replace(/\n(?!\n)/g, ' ').replace(/\n\n/g, '\n');
      continue;
    }
    if (rest === '') {
      const nested: Record<string, unknown> = {};
      let sawChild = false;
      while (index < lines.length) {
        const child = lines[index]!;
        if (child.trim() === '' || child.trim().startsWith('#')) {
          index += 1;
          continue;
        }
        if (!/^\s+/.test(child)) break;
        const childMatch = /^\s+([A-Za-z0-9_-]+):(.*)$/.exec(child);
        if (!childMatch) return { error: `invalid nested key at line ${index + 1}` };
        nested[childMatch[1]!] = parseScalar(childMatch[2]!.trim());
        sawChild = true;
        index += 1;
      }
      root[key] = sawChild ? nested : null;
      continue;
    }
    root[key] = parseScalar(rest);
  }
  return { value: root };
}

function parseScalar(raw: string): unknown {
  if (raw === '') return null;
  if (
    (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) ||
    (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2)
  ) {
    const inner = raw.slice(1, -1);
    return raw.startsWith('"')
      ? inner.replace(
          /\\(["\\nt])/g,
          (_, c: string) => ({ '"': '"', '\\': '\\', n: '\n', t: '\t' })[c]!,
        )
      : inner.replace(/''/g, "'");
  }
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw.replace(/\s+#.*$/, '');
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readMetadata(value: unknown): {
  author: string | null;
  version: string | null;
  tags: string[];
} {
  if (!value || typeof value !== 'object') return { author: null, version: null, tags: [] };
  const record = value as Record<string, unknown>;
  const rawTags = record.tags;
  const tags =
    typeof rawTags === 'string'
      ? rawTags
          .split(/[,\s]+/)
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [];
  const version = record.version;
  return {
    author: optionalString(record.author),
    version: typeof version === 'number' ? String(version) : optionalString(version),
    tags: [...new Set(tags)].slice(0, 16),
  };
}
