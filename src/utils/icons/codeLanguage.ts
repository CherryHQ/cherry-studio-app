const iconCache = new Map<string, any>()

// export png from https://icones.js.org/collection/devicon
const CODE_LANGUAGE_ICONS = {
  javascript: require('@/assets/images/codeLanguageIcons/Javascript.png'),
  typescript: require('@/assets/images/codeLanguageIcons/Typescript.png'),
  c: require('@/assets/images/codeLanguageIcons/C.png'),
  cpp: require('@/assets/images/codeLanguageIcons/Cplusplus.png'),
  csharp: require('@/assets/images/codeLanguageIcons/Csharp.png'),
  css: require('@/assets/images/codeLanguageIcons/Css.png'),
  go: require('@/assets/images/codeLanguageIcons/Go.png'),
  java: require('@/assets/images/codeLanguageIcons/Java.png'),
  rust: require('@/assets/images/codeLanguageIcons/Rust.png'),
  python: require('@/assets/images/codeLanguageIcons/Python.png'),
  markdown: require('@/assets/images/codeLanguageIcons/Markdown.png'),
  html: require('@/assets/images/codeLanguageIcons/Html.png'),
  kotlin: require('@/assets/images/codeLanguageIcons/Kotlin.png'),
  zig: require('@/assets/images/codeLanguageIcons/Zig.png'),
  matlab: require('@/assets/images/codeLanguageIcons/Matlab.png')
}

export function getCodeLanguageIcon(language: string): any {
  const cacheKey = `${language}`

  // 检查缓存
  if (iconCache.has(cacheKey)) {
    return iconCache.get(cacheKey)
  }

  // 使用类型断言来确保 language 可以作为 CODE_LANGUAGE_ICONS 的键
  const result = CODE_LANGUAGE_ICONS[language as keyof typeof CODE_LANGUAGE_ICONS] || null

  // 缓存结果
  iconCache.set(cacheKey, result)
  return result
}
