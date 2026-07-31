import { Input } from 'heroui-native/input';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

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
      className="min-h-24 rounded-xl px-3 py-3 font-mono text-foreground text-sm leading-5"
      isDisabled={isDisabled}
      multiline
      onChangeText={onChangeText}
      placeholder={t('settings.mcp.headers.placeholder')}
      placeholderColorClassName="accent-muted-foreground"
      spellCheck={false}
      style={styles.input}
      textAlignVertical="top"
      value={value}
      variant="secondary"
    />
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 96,
  },
});
