import { resolve } from 'node:path';

const SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
// eslint-disable-next-line no-control-regex
const UNSAFE_PATH_CHARS_RE = /[\u0000-\u001f\u007f]/;

/**
 * Validate a command-line value that ends up inside a file name or directory name
 * (run ids, attempt numbers, build ids). Only a plain token is accepted, so the value
 * can never contain a path separator or a `..` segment.
 */
export function requireSafeId(value: string, label: string): string {
  if (!SAFE_ID_RE.test(value) || value.includes('..')) {
    throw new Error(`Invalid ${label}: expected 1-128 characters from A-Z a-z 0-9 . _ -`);
  }
  return value;
}

/**
 * Validate a command-line path and return it as an absolute, normalized path.
 * Rejects empty values and control characters (NUL, newlines) that could truncate
 * or split the path when it is passed to the file system or written to a log or output file.
 */
export function requireCliPath(value: string, label: string): string {
  if (value.trim() === '' || UNSAFE_PATH_CHARS_RE.test(value)) {
    throw new Error(`Invalid ${label}: expected a non-empty path without control characters.`);
  }
  return resolve(value);
}
