import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { z } from 'zod';

import { useResolvedFile } from '@/frontend/components/FileEntryPreview';
import { FileEntryIdSchema } from '@/shared/data/types/file';

const inputSchema = z.object({
  mode: z.enum(['generate', 'edit']),
  name: z.string().optional(),
  image_ids: z.array(FileEntryIdSchema).optional(),
});

export function ImageGenerationApproval({ input }: { input: unknown }) {
  const { t } = useTranslation();
  const parsed = inputSchema.safeParse(input);
  const data = parsed.success ? parsed.data : undefined;
  const reference = useResolvedFile(data?.image_ids?.[0]);
  return (
    <View className="gap-3">
      <Text className="font-semibold text-foreground">
        {t(data?.mode === 'edit' ? 'chat.tool.image.edit' : 'chat.tool.image.generate')}
      </Text>
      {data?.name ? <Text className="text-foreground">{data.name}</Text> : null}
      {data?.mode === 'edit' ? (
        reference.data ? (
          <Image
            accessibilityLabel={t('agent.avatarStudio.create.reference')}
            source={{ uri: reference.data.uri }}
            style={{ width: 160, height: 160 }}
            contentFit="contain"
          />
        ) : (
          <Text className="text-sm text-muted-foreground">
            {t('chat.tool.image.referenceUnavailable')}
          </Text>
        )
      ) : null}
    </View>
  );
}
