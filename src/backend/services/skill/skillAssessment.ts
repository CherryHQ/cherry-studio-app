import { SkillsError } from '@/shared/contracts/skills';
import { BUILT_IN_TOOL_DESCRIPTORS } from '@/shared/data/types/builtInTool';
import {
  SkillAssessmentSchema,
  SkillRequirementsSchema,
  type SkillProfile,
} from '@/shared/data/types/skill';

import { analyzeSkillRequirements } from './skillAdmission';
import type { SkillAi } from './skillAi';
import { decodeUtf8, type SkillPackageFiles, type ValidatedSkillPackage } from './skillPackage';

const MAX_ASSESSMENT_CHARACTERS = 100_000;
const MAX_ASSESSMENT_FILES = 80;

/** All text is included, or assessment is refused. No silent truncation or partial approval. */
export async function assessSkillPackage(
  ai: Pick<SkillAi, 'assess'>,
  pkg: ValidatedSkillPackage,
  files: SkillPackageFiles,
  pluginCatalog: ReadonlyMap<string, ReadonlySet<string>>,
  signal?: AbortSignal,
): Promise<SkillProfile> {
  const contents = readAssessmentFiles(files);
  const result = await ai.assess(
    { files: contents, capabilities: skillAssessmentCapabilities(pluginCatalog) },
    signal,
  );
  signal?.throwIfAborted();
  return validateAssessment(result, pkg, contents, pluginCatalog);
}

export function readAssessmentFiles(files: SkillPackageFiles) {
  const contents: { path: string; content: string }[] = [];
  let characters = 0;
  for (const [path, bytes] of files) {
    const content = decodeUtf8(bytes);
    if (content === null || content.includes('\u0000')) {
      throw new SkillsError(
        'ai-package-too-large',
        'AI assessment requires a complete text-only package.',
      );
    }
    characters += [...content].length;
    if (characters > MAX_ASSESSMENT_CHARACTERS)
      throw new SkillsError(
        'ai-package-too-large',
        'The complete package exceeds the AI assessment budget.',
      );
    contents.push({ path, content });
  }
  if (characters > MAX_ASSESSMENT_CHARACTERS || contents.length > MAX_ASSESSMENT_FILES) {
    throw new SkillsError(
      'ai-package-too-large',
      'The complete package exceeds the AI assessment budget.',
    );
  }
  return contents;
}

export function skillAssessmentCapabilities(
  pluginCatalog: ReadonlyMap<string, ReadonlySet<string>>,
) {
  return {
    builtInTools: BUILT_IN_TOOL_DESCRIPTORS,
    plugins: [...pluginCatalog].map(([pluginId, tools]) => ({ pluginId, tools: [...tools] })),
    packageResources: 'Read-only text files from this exact package; never execution.',
    managedFiles: 'Conversation-ledger files only, never arbitrary device paths.',
  };
}

function validateAssessment(
  result: Awaited<ReturnType<SkillAi['assess']>>,
  pkg: ValidatedSkillPackage,
  contents: { path: string; content: string }[],
  pluginCatalog: ReadonlyMap<string, ReadonlySet<string>>,
): SkillProfile {
  const parsedRequirements = SkillRequirementsSchema.safeParse(result.requirements);
  const parsedAssessment = SkillAssessmentSchema.safeParse(result.assessment);
  if (!parsedRequirements.success || !parsedAssessment.success)
    throw new SkillsError('ai-response-invalid', 'Invalid AI assessment contract.');
  const requirements = parsedRequirements.data;
  const assessment = parsedAssessment.data;
  const texts = new Map(contents.map(({ path, content }) => [path, content]));
  const evidencePaths = new Set(assessment.evidence.map(({ path }) => path));
  if (
    assessment.evidence.some(
      ({ path, quote }) => !quote.trim() || !texts.get(path)?.includes(quote),
    ) ||
    contents.some(({ path, content }) => content.trim() && !evidencePaths.has(path)) ||
    requirements.pluginTools.some(({ pluginId, tools }) =>
      tools.some((tool) => !pluginCatalog.get(pluginId)?.has(tool)),
    )
  ) {
    throw new SkillsError(
      'ai-response-invalid',
      'Assessment evidence or tool references could not be verified.',
    );
  }
  // Rule-derived requirements are a floor, never removed by model interpretation.
  const rules = analyzeSkillRequirements(pkg, pluginCatalog).requirements;
  const plugins = new Map(
    requirements.pluginTools.map(({ pluginId, tools }) => [pluginId, new Set(tools)]),
  );
  for (const { pluginId, tools } of rules.pluginTools) {
    const combined = plugins.get(pluginId) ?? new Set<string>();
    for (const tool of tools) combined.add(tool);
    plugins.set(pluginId, combined);
  }
  return {
    packageDigest: pkg.packageDigest,
    provenance: 'ai-assessed',
    workflowScope: assessment.summary,
    assessment: {
      ...assessment,
      uncertainties: [...new Set(assessment.uncertainties)],
      evidence: [
        ...new Map(assessment.evidence.map((item) => [JSON.stringify(item), item])).values(),
      ],
    },
    requirements: {
      ...requirements,
      execution: rules.execution !== 'none' ? rules.execution : requirements.execution,
      builtInTools: [...new Set([...rules.builtInTools, ...requirements.builtInTools])],
      pluginTools: [...plugins].map(([pluginId, tools]) => ({ pluginId, tools: [...tools] })),
    },
  };
}
