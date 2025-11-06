import { loggerService } from '@/services/LoggerService'

const logger = loggerService.withContext('CopilotService')

// 配置常量，集中管理
const CONFIG = {
  GITHUB_CLIENT_ID: 'Iv1.b507a08c87ecfe98',
  POLLING: {
    MAX_ATTEMPTS: 8,
    INITIAL_DELAY_MS: 1000,
    MAX_DELAY_MS: 16000 // 最大延迟16秒
  },
  DEFAULT_HEADERS: {
    accept: 'application/json',
    'editor-version': 'Neovim/0.6.1',
    'editor-plugin-version': 'copilot.vim/1.16.0',
    'content-type': 'application/json',
    'user-agent': 'GithubCopilot/1.155.0',
    'accept-encoding': 'gzip,deflate,br'
  },
  // API端点集中管理
  API_URLS: {
    GITHUB_USER: 'https://api.github.com/user',
    GITHUB_DEVICE_CODE: 'https://github.com/login/device/code',
    GITHUB_ACCESS_TOKEN: 'https://github.com/login/oauth/access_token',
    COPILOT_TOKEN: 'https://api.github.com/copilot_internal/v2/token'
  }
}

// 接口定义移到顶部，便于查阅
interface UserResponse {
  login: string
  avatar: string
}

interface AuthResponse {
  device_code: string
  user_code: string
  verification_uri: string
}

interface TokenResponse {
  access_token: string
}

interface CopilotTokenResponse {
  token: string
}

// 自定义错误类，统一错误处理
class CopilotServiceError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'CopilotServiceError'
  }
}

/**
 * Copilot Service
 *
 * NOTE: Token management has been moved to useCopilotToken hook.
 * This service now focuses on GitHub OAuth flow and token exchange logic.
 */
class CopilotService {
  private static instance: CopilotService
  private headers: Record<string, string>

  private constructor() {
    this.headers = {
      ...CONFIG.DEFAULT_HEADERS,
      accept: 'application/json',
      'user-agent': 'Visual Studio Code (desktop)'
    }
  }

  public static getInstance(): CopilotService {
    if (!CopilotService.instance) {
      CopilotService.instance = new CopilotService()
    }
    return CopilotService.instance
  }

  /**
   * 设置自定义请求头
   */
  private updateHeaders = (headers?: Record<string, string>): void => {
    if (headers && Object.keys(headers).length > 0) {
      this.headers = { ...headers }
    }
  }

  /**
   * 获取GitHub登录信息
   */
  public getUser = async (token: string): Promise<UserResponse> => {
    try {
      const response = await fetch(CONFIG.API_URLS.GITHUB_USER, {
        method: 'GET',
        headers: {
          Connection: 'keep-alive',
          'user-agent': 'Visual Studio Code (desktop)',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-Mode': 'no-cors',
          'Sec-Fetch-Dest': 'empty',
          accept: 'application/json',
          authorization: `token ${token}`
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      return {
        login: data.login,
        avatar: data.avatar_url
      }
    } catch (error) {
      logger.error('Failed to get user information:', error as Error)
      throw new CopilotServiceError('无法获取GitHub用户信息', error)
    }
  }

  /**
   * 获取GitHub设备授权信息
   */
  public getAuthMessage = async (headers?: Record<string, string>): Promise<AuthResponse> => {
    try {
      this.updateHeaders(headers)

      const response = await fetch(CONFIG.API_URLS.GITHUB_DEVICE_CODE, {
        method: 'POST',
        headers: {
          ...this.headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: CONFIG.GITHUB_CLIENT_ID,
          scope: 'read:user'
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return (await response.json()) as AuthResponse
    } catch (error) {
      logger.error('Failed to get auth message:', error as Error)
      throw new CopilotServiceError('无法获取GitHub授权信息', error)
    }
  }

  /**
   * 使用设备码获取访问令牌 - 优化轮询逻辑
   */
  public getCopilotToken = async (
    device_code: string,
    headers?: Record<string, string>
  ): Promise<TokenResponse> => {
    this.updateHeaders(headers)

    let currentDelay = CONFIG.POLLING.INITIAL_DELAY_MS

    for (let attempt = 0; attempt < CONFIG.POLLING.MAX_ATTEMPTS; attempt++) {
      await this.delay(currentDelay)

      try {
        const response = await fetch(CONFIG.API_URLS.GITHUB_ACCESS_TOKEN, {
          method: 'POST',
          headers: {
            ...this.headers,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            client_id: CONFIG.GITHUB_CLIENT_ID,
            device_code,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
          })
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const data = (await response.json()) as TokenResponse
        const { access_token } = data
        if (access_token) {
          return { access_token }
        }
      } catch (error) {
        // 指数退避策略
        currentDelay = Math.min(currentDelay * 2, CONFIG.POLLING.MAX_DELAY_MS)

        // 仅在最后一次尝试失败时记录详细错误
        const isLastAttempt = attempt === CONFIG.POLLING.MAX_ATTEMPTS - 1
        if (isLastAttempt) {
          logger.error(`Token polling failed after ${CONFIG.POLLING.MAX_ATTEMPTS} attempts:`, error as Error)
        }
      }
    }

    throw new CopilotServiceError('获取访问令牌超时，请重试')
  }

  /**
   * 获取Copilot API token (需要传入已保存的 access_token)
   */
  public getToken = async (accessToken: string, headers?: Record<string, string>): Promise<CopilotTokenResponse> => {
    try {
      this.updateHeaders(headers)

      const response = await fetch(CONFIG.API_URLS.COPILOT_TOKEN, {
        method: 'GET',
        headers: {
          ...this.headers,
          authorization: `token ${accessToken}`
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return (await response.json()) as CopilotTokenResponse
    } catch (error) {
      logger.error('Failed to get Copilot token:', error as Error)
      throw new CopilotServiceError('无法获取Copilot令牌，请重新授权', error)
    }
  }

  /**
   * 辅助方法：延迟执行
   */
  private delay = (ms: number): Promise<void> => {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

// Export singleton instance
export default CopilotService.getInstance()
