import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import { PluginIcon } from '@/frontend/components/PluginIcon';

import { PluginPage } from '../../components/PluginPage';
import { BUILTIN_TOOLS, type BuiltinToolId } from '../builtinTools';

/** All built-in capability pages share the same identity and content layout. */
export function BuiltinToolPage({
  toolId,
  children,
}: {
  toolId: BuiltinToolId;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const tool = BUILTIN_TOOLS[toolId];
  const name = t(tool.nameKey);
  return (
    <>
      <RouteHeader title={name} />
      <PluginPage testID={`builtin-tool-${toolId}`}>
        <View className="flex-row items-center gap-4">
          <PluginIcon glyph={tool.glyph} size="large" />
          <View className="min-w-0 flex-1 gap-1">
            <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">
              {name}
            </Text>
            <Text className="text-sm text-muted-foreground">{t(tool.summaryKey)}</Text>
          </View>
        </View>
        {children}
      </PluginPage>
    </>
  );
}
