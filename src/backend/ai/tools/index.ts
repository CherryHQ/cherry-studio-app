export {
  createConfiguredGenerateImageTool,
  createGenerateImageTool,
  GENERATE_IMAGE_TOOL_NAME,
} from './adapters/aiSdk/builtin/PaintingTool';
export type { PaintingToolDependencies } from './painting';
export type { ToolResolverDependencies } from './ToolResolver';
export { ToolResolver } from './ToolResolver';
export type { RequestContext, ToolApplyScope, ToolDefer, ToolEntry } from './types';
