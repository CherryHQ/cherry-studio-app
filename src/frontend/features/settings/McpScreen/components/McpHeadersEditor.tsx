import { Input } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

type McpHeadersEditorProps = {
  onChangeText: (value: string) => void;
  value: string;
};

export function McpHeadersEditor({ onChangeText, value }: McpHeadersEditorProps) {
  const { t } = useTranslation();

  return (
    <Input
      accessibilityLabel={t('settings.mcp.headers.title')}
      autoCapitalize="none"
      autoCorrect={false}
      multiline
      onChangeText={onChangeText}
      placeholder={t('settings.mcp.headers.placeholder')}
      spellCheck={false}
      textAlignVertical="top"
      value={value}
    />
  );
}
