/**
 * What a Skill package asks of this app, and which of it the app does not
 * provide.
 *
 * The app's side is fixed by the build: it ignores permissions, providers,
 * plugin connections and the Agent, because an unconfigured capability is the
 * user's to configure. The package's side is already stored with the
 * installation, as its manifest and the profile read once from accepted bytes,
 * so comparing the two needs no I/O.
 */

import type { BuiltInToolCapabilityId } from '@/shared/data/types/builtInTool';
import type { SkillLimitations, SkillManifestEntry, SkillProfile } from '@/shared/data/types/skill';

import type { SkillFrontmatter } from './skillPackage';

/**
 * Desktop tool names packages declare in `allowed-tools`, with the built-in
 * tool that covers each. `null` means the app has no counterpart. Names absent
 * here, such as MCP tools, are unknown and never reported.
 */
const APP_TOOL_FOR_DECLARED_NAME: ReadonlyMap<string, BuiltInToolCapabilityId | null> = new Map([
  ['AskUserQuestion', 'ask_user_question'],
  ['Edit', 'edit_file'],
  ['MultiEdit', 'edit_file'],
  ['Read', 'read_file'],
  ['WebFetch', 'web_fetch'],
  ['WebSearch', 'web_search'],
  ['Write', 'write_file'],
  ['Agent', null],
  ['Bash', null],
  ['BashOutput', null],
  ['Glob', null],
  ['Grep', null],
  ['KillShell', null],
  ['LS', null],
  ['NotebookEdit', null],
  ['Task', null],
]);

/**
 * The app runs no package script: `run_js` evaluates only code the model
 * writes. Shell and Python files count anywhere. Other source files count only
 * under the conventional directory, because elsewhere they are usually
 * templates; schemas and data kept beside scripts are not scripts.
 */
const SCRIPT_PATH = /\.(?:sh|bash|zsh|ps1|bat|cmd|py)$|^scripts\/.*\.(?:[cm]?js|ts|rb|pl|php)$/i;
const DECLARED_TOOL_NAME = /^[\w.:-]{1,64}$/;
const DECLARED_TOOLS_MAX = 64;

function readDeclaredTools(value: unknown): string[] {
  const entries = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
  const names = entries
    .filter((entry): entry is string => typeof entry === 'string')
    // `Bash(git add:*)` scopes one tool; its pattern may contain separators.
    .flatMap((entry) => entry.replace(/\([^)]*\)/g, ' ').split(/[\s,]+/))
    .filter((name) => DECLARED_TOOL_NAME.test(name));
  return [...new Set(names)].slice(0, DECLARED_TOOLS_MAX);
}

/** Reads a package's profile from its validated bytes. */
export function deriveSkillProfile(pkg: { frontmatter: SkillFrontmatter }): SkillProfile {
  return { declaredTools: readDeclaredTools(pkg.frontmatter['allowed-tools']) };
}

/** The part of a package this build of the app does not provide. */
export function evaluateSkillLimitations(pkg: {
  manifest: readonly Pick<SkillManifestEntry, 'path'>[];
  profile: SkillProfile;
}): SkillLimitations {
  return {
    scripts: pkg.manifest.map(({ path }) => path).filter((path) => SCRIPT_PATH.test(path)),
    unavailableTools: pkg.profile.declaredTools.filter(
      (name) => APP_TOOL_FOR_DECLARED_NAME.get(name) === null,
    ),
  };
}
