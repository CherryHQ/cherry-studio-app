import type { ToolResultMessage } from '@earendil-works/pi-ai';

import { projectMcpModelContent } from '@/shared/contracts/mcpContent';

import type { RuntimeToolResult } from '../types';

/** Only this channel is sent to the provider; details retain the app projection. */
export function piToolModelContent(
  output: RuntimeToolResult,
  isMcp = false,
  acceptsImages = true,
): ToolResultMessage['content'] {
  if (output.modelContent)
    return output.modelContent.map((block) => {
      if (block.type === 'text') return block;
      const image = output.modelImages?.find(
        (item) => item.fileEntryId === block.fileEntryId && item.mimeType === block.mimeType,
      );
      return image && acceptsImages
        ? { type: 'image', data: image.data, mimeType: image.mimeType }
        : { type: 'text', text: `[MCP image attachment: ${block.fileEntryId}]` };
    });
  return isMcp
    ? projectMcpModelContent(output.value).map((block) =>
        block.type === 'image' && !acceptsImages
          ? {
              type: 'text' as const,
              text: '[MCP image omitted: this model does not accept images]',
            }
          : block,
      )
    : [{ type: 'text', text: JSON.stringify(output) }];
}

export function persistentToolResult(
  output: RuntimeToolResult,
): Omit<RuntimeToolResult, 'modelImages'> {
  const { modelImages: _images, ...persistent } = output;
  return persistent;
}
