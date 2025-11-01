/**
 * 用于展示一些常用的网站名
 */
const WEBSITE_BRAND: Record<string, string> = {
  google: 'Google',
  apple: 'Apple',
  wikipedia: 'Wikipedia',
  facebook: 'FaceBook',
  baidu: 'Baidu',
  bing: 'Bing',
  x: 'X',
  twitter: 'Twitter',
  default: 'Web'
}

export function getWebsiteBrand(url: string): string {
  try {
    const { hostname } = new URL(url)

    for (const brand in WEBSITE_BRAND) {
      if (brand === 'default') continue

      const regex = new RegExp(`\\b${brand}\\b`, 'i')

      if (regex.test(hostname)) {
        return WEBSITE_BRAND[brand]
      }
    }
  } catch {
    return WEBSITE_BRAND.default
  }

  return WEBSITE_BRAND.default
}
