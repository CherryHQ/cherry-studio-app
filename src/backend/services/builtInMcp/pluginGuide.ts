/** Plugin-owned data imported from an ordinary TypeScript module. */
export type PluginGuideDefinition = {
  readonly revision: number;
  readonly sections: readonly PluginGuideSection[];
};

export type PluginGuideSection = {
  readonly requiredTools: readonly string[];
  readonly content: string;
};

/** Detached instructions selected from one connection's executable tools for one turn. */
export type PluginGuideSnapshot = {
  readonly pluginId: string;
  readonly serverId: string;
  readonly revision: number;
  readonly content: string;
};

const MAX_GUIDE_BYTES = 8_192;
const MAX_GUIDE_SECTIONS = 32;

/** Validate authoring limits and require every prerequisite to belong to this plugin. */
export function validatePluginGuide(
  guide: PluginGuideDefinition,
  admittedTools: Readonly<Record<string, unknown>>,
): void {
  if (
    !Number.isSafeInteger(guide.revision) ||
    guide.revision < 1 ||
    guide.sections.length === 0 ||
    guide.sections.length > MAX_GUIDE_SECTIONS
  ) {
    throw new Error('Invalid bundled plugin guide revision or section count.');
  }

  for (const { requiredTools, content } of guide.sections) {
    if (!content.trim()) throw new Error('A plugin guide section must not be empty.');
    if (
      new Set(requiredTools).size !== requiredTools.length ||
      requiredTools.some((name) => !Object.hasOwn(admittedTools, name))
    ) {
      throw new Error('A plugin guide requires a duplicate or unadmitted tool.');
    }
  }
  const content = guide.sections.map((section) => section.content.trim()).join('\n\n');
  if (new TextEncoder().encode(content).byteLength > MAX_GUIDE_BYTES) {
    throw new Error('A bundled plugin guide exceeds the content size limit.');
  }
}
