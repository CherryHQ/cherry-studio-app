import { formatApiHost } from './api'

describe('formatApiHost', () => {
  it('appends the default version for bare OpenAI-compatible hosts', () => {
    expect(formatApiHost('https://api.deepseek.com')).toBe('https://api.deepseek.com/v1/')
  })

  it('keeps existing numeric version paths and only adds a trailing slash', () => {
    expect(formatApiHost('https://api.minimaxi.com/v1')).toBe('https://api.minimaxi.com/v1/')
    expect(formatApiHost('https://open.bigmodel.cn/api/paas/v4')).toBe('https://open.bigmodel.cn/api/paas/v4/')
    expect(formatApiHost('https://ark.cn-beijing.volces.com/api/v3')).toBe('https://ark.cn-beijing.volces.com/api/v3/')
  })

  it('keeps non-terminal version segments and only adds a trailing slash', () => {
    expect(formatApiHost('https://cephalon.cloud/user-center/v1/model')).toBe(
      'https://cephalon.cloud/user-center/v1/model/'
    )
  })

  it('supports non-numeric api versions such as v1beta', () => {
    expect(formatApiHost('https://generativelanguage.googleapis.com', 'v1beta')).toBe(
      'https://generativelanguage.googleapis.com/v1beta/'
    )
    expect(formatApiHost('https://generativelanguage.googleapis.com/v1beta', 'v1beta')).toBe(
      'https://generativelanguage.googleapis.com/v1beta/'
    )
  })
})
