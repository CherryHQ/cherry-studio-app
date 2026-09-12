/* oxlint-disable react/no-array-index-key -- Snapshot arrays never reorder; option changes remount the preview. */
import { MessagePart } from '@cherrystudio/ui/components';
import { Text, View } from 'react-native';

import { MarkdownText } from '@/frontend/components/MarkdownText';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';
import type { ExportBlock, ExportDocument } from '@/shared/contracts/documentExport';

/** Keep disclosure structure intact; Markdown is only the renderer for leaf prose. */
export function DocumentExportTextPreview({ document }: { document: ExportDocument }) {
  const isConversation = document.sections.some((section) => section.presentation);
  return (
    <View>
      {document.title && !isConversation ? (
        <Text className="font-semibold text-foreground text-xl">{document.title}</Text>
      ) : null}
      {document.sections.map((section) => (
        <ExportSectionPreview key={section.id} section={section} />
      ))}
    </View>
  );
}

function ExportSectionPreview({ section }: { section: ExportDocument['sections'][number] }) {
  if (section.presentation === 'bubble') {
    const attachments = section.blocks.filter(
      (block) => block.kind === 'image' || block.kind === 'attachment',
    );
    const content = section.blocks.filter(
      (block) => block.kind !== 'image' && block.kind !== 'attachment',
    );
    return (
      <View accessibilityLabel={section.heading} className="items-end py-2">
        <View className="w-[88%] items-end gap-2">
          <ExportBlocksPreview blocks={attachments} />
          {content.length > 0 || section.metadata?.length ? (
            <View className="max-w-full gap-2 rounded-[18px] bg-chat-user px-4 py-2.5">
              {section.metadata?.map((item, index) => (
                <Text className="text-muted-foreground text-sm" key={index}>
                  {item.label}: {item.value}
                </Text>
              ))}
              <ExportBlocksPreview blocks={content} />
            </View>
          ) : null}
        </View>
      </View>
    );
  }
  return (
    <View className="gap-2.5 py-3">
      {section.heading ? (
        <Text
          className={
            section.presentation === 'message'
              ? 'font-semibold text-foreground text-sm'
              : 'font-semibold text-foreground text-lg'
          }
        >
          {section.heading}
        </Text>
      ) : null}
      <View className="gap-4">
        {section.metadata?.map((item, index) => (
          <Text className="text-muted-foreground text-sm" key={index}>
            {item.label}: {item.value}
          </Text>
        ))}
        <ExportBlocksPreview blocks={section.blocks} />
      </View>
    </View>
  );
}

function ExportBlocksPreview({ blocks }: { blocks: readonly ExportBlock[] }) {
  // The session owns an immutable, ordered snapshot; changing options remounts this preview.
  return blocks.map((block, index) => <ExportBlockPreview block={block} key={index} />);
}

function ExportBlockPreview({ block }: { block: ExportBlock }) {
  switch (block.kind) {
    case 'text':
      return (
        <Text className="text-base text-foreground" selectable>
          {block.text}
        </Text>
      );
    case 'markdown':
      return <MarkdownText markdown={block.source} />;
    case 'details':
      if (!block.blocks.length) {
        return (
          <MessagePart.Status>
            <Text className="text-foreground-tertiary text-sm">{block.summary}</Text>
          </MessagePart.Status>
        );
      }
      return block.presentation === 'process' ? (
        <MessagePart.Process state="complete" title={block.summary}>
          <ExportBlocksPreview blocks={block.blocks} />
        </MessagePart.Process>
      ) : (
        <MessagePart.Reasoning state="complete" statusText={block.summary}>
          <View className="gap-3">
            <ExportBlocksPreview blocks={block.blocks} />
          </View>
        </MessagePart.Reasoning>
      );
    case 'image':
      // Markdown exports use a label for managed images; no file read is needed for this preview.
      return (
        <Text className="text-muted-foreground text-sm" selectable>
          [{block.alt}]
        </Text>
      );
    case 'attachment':
      return (
        <Text className="text-muted-foreground text-sm" selectable>
          {block.name}
          {block.mediaType ? ` (${block.mediaType})` : ''}
        </Text>
      );
    case 'links':
      return (
        <View className="gap-2">
          {block.items.map((item, index) => (
            <MessagePart.Source
              key={index}
              label={item.label}
              onPress={openExportLink}
              url={item.url}
              variant="list-item"
            />
          ))}
        </View>
      );
  }
}

function openExportLink(value: string) {
  try {
    const url = new URL(value);
    if (['https:', 'http:', 'mailto:'].includes(url.protocol) && !url.username && !url.password) {
      void openExternalUrl(url.href);
    }
  } catch {
    // Invalid source references remain readable but cannot navigate.
  }
}
