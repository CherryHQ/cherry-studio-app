import type { ToolResultMessage } from '@earendil-works/pi-ai';

import { projectMcpModelContent } from '@/shared/contracts/mcpContent';

import { toModelToolResult } from '../toolResults';
import type { RuntimeToolResult } from '../types';

/** Only this channel is sent to the provider; details retain the app projection. */
export function piToolModelContent(
  output: RuntimeToolResult,
  isMcp = false,
  acceptsImages = true,
): ToolResultMessage['content'] {
  if (!output.modelContent && !isMcp)
    return [{ type: 'text', text: JSON.stringify(toModelToolResult(output)) }];
  const content: ToolResultMessage['content'] = output.modelContent
    ? output.modelContent.map((block) => {
        if (block.type === 'text') return block;
        const image = output.modelImages?.find(
          (item) => item.fileEntryId === block.fileEntryId && item.mediaType === block.mimeType,
        );
        return image && acceptsImages
          ? { type: 'image', data: image.data, mimeType: image.mediaType }
          : { type: 'text', text: `[MCP image attachment: ${block.fileEntryId}]` };
      })
    : projectMcpModelContent(output.value).map((block) =>
        block.type === 'image' && !acceptsImages
          ? { type: 'text', text: '[MCP image omitted: this model does not accept images]' }
          : block,
      );
  // Files the importer saved stay reachable by a follow-up call; remote JSON never names them.
  return output.artifacts.length
    ? [...content, { type: 'text', text: JSON.stringify({ artifacts: output.artifacts }) }]
    : content;
}

export function persistentToolResult(
  output: RuntimeToolResult,
): Omit<RuntimeToolResult, 'modelImages'> {
  const { modelImages: _images, ...persistent } = output;
  return persistent;
}
