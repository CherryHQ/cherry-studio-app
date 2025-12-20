import removeMarkdown from 'remove-markdown'

export const markdownToPlainText = (markdown: string): string => {
  if (!markdown) {
    return ''
  }

  return removeMarkdown(markdown)
}
