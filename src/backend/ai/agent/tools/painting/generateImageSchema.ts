/**
 * The `generate_image` description and input contract are built from the configured drawing
 * model's capability block rather than fixed: two providers expose different
 * canonical parameters, and offering a model a parameter it rejects wastes a
 * call. A turn with no configured model gets the fallback contract.
 */

import {
  type CanonicalParamKey,
  IMAGE_PARAM_CATALOG,
  type ImageGenerationMode,
  type ImageGenerationSupport,
  type SupportSpec,
} from '@cherrystudio/provider-registry';
import * as z from 'zod';

const MAX_INPUT_IMAGES = 1;

const GENERATE_IMAGE_PROMPT_FIELD = z
  .string()
  .trim()
  .min(1)
  .max(4000)
  .describe(
    'Describe the desired result vividly, including subject, style, composition, and mood.',
  );

type ToolMode = Extract<ImageGenerationMode, 'generate' | 'edit'>;

export type GenerateImageToolInput = {
  image_ids?: string[] | null;
  prompt: string;
} & Partial<Record<CanonicalParamKey, unknown>>;

function describeParam(key: CanonicalParamKey, spec: SupportSpec, modes: readonly ToolMode[]) {
  const prefix = `Canonical painting parameter for ${modes.join('/')} mode: ${key}.`;
  switch (spec.type) {
    case 'enum':
      return `${prefix} Allowed values: ${spec.options.join(', ')}.${spec.default === undefined ? '' : ` Default: ${spec.default}.`}`;
    case 'range':
      return `${prefix} Range: ${spec.min}-${spec.max}.${spec.step === undefined ? '' : ` Step: ${spec.step}.`}${spec.default === undefined ? '' : ` Default: ${spec.default}.`}`;
    case 'size':
      return `${prefix} Use WIDTHxHEIGHT with each side between ${spec.minSide} and ${spec.maxSide}.`;
    case 'switch':
      return `${prefix}${spec.default === undefined ? '' : ` Default: ${spec.default}.`}`;
    case 'text':
      return prefix;
    default: {
      const exhaustive: never = spec;
      return exhaustive;
    }
  }
}

type CatalogJsonType = 'boolean' | 'integer' | 'number' | 'string';

function catalogJsonType(key: CanonicalParamKey): CatalogJsonType | undefined {
  const catalogSchema = IMAGE_PARAM_CATALOG[key].schema as unknown as {
    nonoptional(): { toJSONSchema(): { type?: string } };
  };
  const type = catalogSchema.nonoptional().toJSONSchema().type;
  return type === 'boolean' || type === 'integer' || type === 'number' || type === 'string'
    ? type
    : undefined;
}

function catalogValueSchema(key: CanonicalParamKey): z.ZodType {
  switch (catalogJsonType(key)) {
    case 'boolean':
      return z.boolean();
    case 'integer':
      return z.coerce.number().int();
    case 'number':
      return z.coerce.number();
    case 'string':
      return z.string();
    default:
      return z.unknown();
  }
}

function constrainedParamSchema(key: CanonicalParamKey, spec: SupportSpec): z.ZodType {
  const base = catalogValueSchema(key);
  switch (spec.type) {
    case 'enum': {
      const [first, ...rest] = spec.options;
      return first === undefined ? base : z.enum([first, ...rest]);
    }
    case 'range': {
      let range =
        catalogJsonType(key) === 'integer'
          ? z.coerce.number().int().min(spec.min).max(spec.max)
          : z.coerce.number().min(spec.min).max(spec.max);
      if (spec.step !== undefined) range = range.multipleOf(spec.step);
      return range;
    }
    case 'size':
      return z
        .string()
        .regex(/^\d+x\d+$/i, 'expected WIDTHxHEIGHT')
        .refine(
          (value) => {
            const [width, height] = value.toLowerCase().split('x').map(Number);
            return (
              width >= spec.minSide &&
              width <= spec.maxSide &&
              height >= spec.minSide &&
              height <= spec.maxSide
            );
          },
          { message: 'size side out of range' },
        );
    default:
      return base;
  }
}

function resolveToolModes(support: ImageGenerationSupport | null | undefined): ToolMode[] {
  if (!support) return ['generate'];
  const modes: ToolMode[] = [];
  if (support.modes.generate) modes.push('generate');
  if (support.modes.edit) modes.push('edit');
  return modes;
}

/** Uses the same capability snapshot as the input schema. */
export function buildGenerateImageToolDescription(
  support: ImageGenerationSupport | null | undefined,
): string {
  const modes = resolveToolModes(support);
  const instructions = [
    `Use the user's configured drawing model for image requests. Available operations: ${modes.join(', ') || 'none'}.`,
  ];

  if (modes.includes('generate')) {
    instructions.push(
      'Generate a new image, illustration, logo, or icon from a prompt without image_ids.',
    );
  } else {
    instructions.push(
      'New-image generation without a reference is unavailable with this drawing model.',
    );
  }

  if (modes.includes('edit')) {
    instructions.push(
      `Edit or use a user-uploaded image or an earlier generated image as a reference: pass its id in image_ids (attachment fileEntryId, generate_image result id, or artifact ref.fileEntryId). Never invent ids or ask the user for one; ask which image only when ambiguous, and ask to reattach one that is unavailable. Describe the changes and what to keep in prompt; never replace the reference with a text-only approximation. At most ${MAX_INPUT_IMAGES} reference image per call; if more are needed, ask which one. This tool reads the original itself; call read_file first only to inspect pixels no longer in context.`,
    );
    if (!modes.includes('generate')) {
      instructions.push('image_ids is required for every call with this drawing model.');
    }
  } else {
    instructions.push(
      'Reference-image editing is unavailable with the current drawing model configuration. For edits, tell the user to choose a drawing model with image editing enabled in Settings > Model; do not substitute text-only generation.',
    );
  }

  instructions.push(
    'Generated images are displayed automatically in the conversation. Returned ids and names are reusable file references, not URLs. Do not embed them as Markdown images or invent preview/download URLs; describe the result in text. Generation can take 10-60 seconds.',
  );
  return instructions.join('\n\n');
}

/** Builds the runtime tool contract from the configured model's capability block. */
export function buildGenerateImageToolSchema(
  support: ImageGenerationSupport | null | undefined,
): z.ZodObject<Record<string, z.ZodType>> {
  const modes = resolveToolModes(support);
  const params = new Map<CanonicalParamKey, { mode: ToolMode; spec: SupportSpec }[]>();

  for (const mode of modes) {
    const modeSupports = support?.modes[mode]?.supports;
    if (!modeSupports) continue;
    for (const [key, spec] of Object.entries(modeSupports) as [CanonicalParamKey, SupportSpec][]) {
      const entries = params.get(key) ?? [];
      entries.push({ mode, spec });
      params.set(key, entries);
    }
  }

  const inputShape: Record<string, z.ZodType> = { prompt: GENERATE_IMAGE_PROMPT_FIELD };

  for (const [key, entries] of params) {
    // Modes usually share a spec. Identical branches would still emit an anyOf without a
    // top-level type, which Gemini-translating gateways reject.
    const specs = new Map(entries.map(({ spec }) => [JSON.stringify(spec), spec]));
    const variants = [...specs.values()].map((spec) => constrainedParamSchema(key, spec));
    const schema = (
      variants.length === 1
        ? variants[0]
        : z.union(variants as [z.ZodType, z.ZodType, ...z.ZodType[]])
    ).describe(
      describeParam(
        key,
        entries[0].spec,
        entries.map(({ mode }) => mode),
      ),
    );
    inputShape[key] = schema.optional();
  }

  if (modes.includes('edit')) {
    const imageIds = z
      .array(z.string().trim().min(1))
      .min(1)
      .max(MAX_INPUT_IMAGES)
      .describe(
        `Reference image file entry id, not a message id, tool call id, or URL. ${modes.includes('generate') ? 'Omit only to generate a new image without a reference.' : 'Required for every call.'}`,
      );
    inputShape.image_ids = modes.includes('generate') ? imageIds.optional() : imageIds;
  }

  return z.object(inputShape).strict();
}

export function limitGenerateImageInputIds(imageIds: readonly string[]): string[] {
  return imageIds.slice(0, MAX_INPUT_IMAGES);
}
