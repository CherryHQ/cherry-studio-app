import { Input } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

type McpHeadersEditorProps = {
  isDisabled?: boolean;
  onChangeText: (value: string) => void;
  value: string;
};

export function McpHeadersEditor({
  isDisabled = false,
  onChangeText,
  value,
}: McpHeadersEditorProps) {
  const { t } = useTranslation();

  return (
    <Input
      accessibilityLabel={t('settings.mcp.headers.title')}
      autoCapitalize="none"
      autoCorrect={false}
      disabled={isDisabled}
      multiline
      onChangeText={onChangeText}
      placeholder={t('settings.mcp.headers.placeholder')}
      spellCheck={false}
      textAlignVertical="top"
      value={value}
    />
  );
}
