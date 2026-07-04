import { StyleSheet } from 'react-native';

export const providerApiServiceStyles = StyleSheet.create({
  apiKeyEditingInput: {
    backgroundColor: 'transparent',
  },
  apiKeyPreviewInput: {
    backgroundColor: 'transparent',
    color: 'transparent',
  },
  apiKeyPreviewHidden: {
    opacity: 0,
  },
  apiKeyPreviewVisible: {
    opacity: 1,
  },
  input: {
    height: 40,
    includeFontPadding: false,
    maxHeight: 40,
    overflow: 'hidden',
    paddingBottom: 0,
    paddingTop: 0,
    textAlignVertical: 'center',
    verticalAlign: 'middle',
  },
});
