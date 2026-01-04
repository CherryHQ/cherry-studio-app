import { StyleSheet } from 'react-native'

export const markdownColors = {
  light: {
    accent: '#c1cacc',
    accentedBackground: '#F7F6F3',
    background: '#f7f7f7ff',
    border: '#e1e7e8',
    text: '#202020ff',
    link: '#00b96b',
    codeBg: 'rgba(0, 0, 0, 0.03)',
    codeBorder: 'rgba(0, 0, 0, 0.05)',
    code: '#00b96b',
    codeBlockBg: '#f7f6f3'
  },
  dark: {
    accent: '#9ca6a8',
    accentedBackground: '#2c2d30',
    background: '#121213ff',
    border: '#3d3d3d',
    text: '#f9f9f9ff',
    link: '#00b96b',
    codeBg: 'rgba(255, 255, 255, 0.05)',
    codeBorder: 'rgba(255, 255, 255, 0.1)',
    code: '#00b96b',
    codeBlockBg: '#202020'
  }
}

/**
 * Creates a stylesheet for the Markdown component based on the color theme.
 * @param isDark - Whether to use the dark theme.
 * @returns A StyleSheet object.
 */
export const createMarkdownStyles = (isDark: boolean) => {
  const currentColors = isDark ? markdownColors.dark : markdownColors.light

  // full style https://github.com/iamacup/react-native-markdown-display/blob/master/src/lib/styles.js
  return StyleSheet.create({
    body: {
      color: currentColors.text,
      fontSize: 16
    },
    heading1: {
      fontSize: 30, // 1.875 * 16
      fontWeight: 'bold',
      color: currentColors.text,
      marginTop: 48,
      marginBottom: 24,
      borderBottomWidth: 0
    },
    heading2: {
      fontSize: 24, // 1.5 * 16
      fontWeight: 'bold',
      color: currentColors.text,
      marginTop: 24,
      marginBottom: 24,
      borderBottomWidth: 0
    },
    heading3: {
      fontSize: 20, // 1.25 * 16
      fontWeight: 'bold',
      color: currentColors.text,
      marginTop: 24,
      marginBottom: 16,
      borderBottomWidth: 0
    },
    heading4: {
      fontSize: 16,
      color: currentColors.text,
      marginTop: 16,
      borderBottomWidth: 0
    },
    heading5: {
      fontSize: 16,
      color: currentColors.text,
      marginTop: 16,
      borderBottomWidth: 0
    },
    heading6: {
      fontSize: 16,
      color: currentColors.text,
      marginTop: 16,
      borderBottomWidth: 0
    },
    hr: {
      backgroundColor: currentColors.border,
      height: 1,
      marginVertical: 32
    },
    code_inline: {
      backgroundColor: currentColors.codeBg,
      color: currentColors.code,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 5,
      fontFamily: 'monospace',
      fontSize: 16 * 0.85
    },
    code_block: {
      backgroundColor: currentColors.codeBlockBg,
      color: currentColors.text,
      padding: 16,
      borderRadius: 5,
      fontFamily: 'monospace',
      fontSize: 16 * 0.85
    },
    fence: {
      backgroundColor: currentColors.codeBlockBg,
      color: currentColors.text,
      padding: 16,
      borderRadius: 5,
      fontFamily: 'monospace',
      fontSize: 16 * 0.85
    },
    blockquote: {
      backgroundColor: currentColors.background,
      paddingLeft: 15,
      marginLeft: 5,
      borderLeftWidth: 3,
      borderLeftColor: currentColors.text
    },
    list_item: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 8
    },
    bullet_list_icon: {
      color: currentColors.text,
      marginRight: 8
    },
    ordered_list_icon: {
      color: currentColors.text,
      marginRight: 8
    },
    link: {
      color: currentColors.link,
      textDecorationLine: 'none'
    },
    paragraph: {
      marginTop: 16,
      marginBottom: 16,
      flexWrap: 'wrap'
    },
    table: {
      borderWidth: 1,
      borderColor: currentColors.border,
      borderRadius: 3,
      marginTop: 16,
      marginBottom: 16
    },
    th: {
      flex: 1,
      padding: 8,
      fontWeight: 'bold',
      backgroundColor: currentColors.accentedBackground
    },
    td: {
      flex: 1,
      padding: 8,
      borderTopWidth: 1,
      borderColor: currentColors.border
    },
    image: {
      borderRadius: 10
    },
    // Text styles
    bold: {
      fontWeight: 'bold' as const
    },
    italic: {
      fontStyle: 'italic' as const
    },
    strikethrough: {
      textDecorationLine: 'line-through' as const
    },
    // List styles
    list: {
      marginVertical: 8
    },
    // Math styles
    math_inline: {
      backgroundColor: currentColors.codeBg,
      color: currentColors.code,
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderRadius: 3,
      fontFamily: 'monospace',
      fontSize: 16 * 0.9
    },
    math_block: {
      backgroundColor: currentColors.codeBlockBg,
      padding: 16,
      borderRadius: 5,
      marginVertical: 16,
      alignItems: 'center' as const
    },
    // Table styles
    table_row: {
      flexDirection: 'row' as const
    }
  })
}
