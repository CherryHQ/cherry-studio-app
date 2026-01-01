import { tool } from 'ai'
import { z } from 'zod'

const RequestPayloadSchema = z.object({
  url: z.string().url()
})

type RequestPayload = z.infer<typeof RequestPayloadSchema>

class Fetcher {
  private static async _fetch({ url }: RequestPayload) {
    try {
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`)
      }
      return response
    } catch (e: unknown) {
      if (e instanceof Error) {
        throw new Error(`Failed to fetch ${url}: ${e.message}`)
      } else {
        throw new Error(`Failed to fetch ${url}: Unknown error`)
      }
    }
  }

  static async html(requestPayload: RequestPayload) {
    try {
      const response = await this._fetch(requestPayload)
      const html = await response.text()
      return { content: [{ type: 'text', text: html }], isError: false }
    } catch (error) {
      return {
        content: (error as Error).message,
        isError: true
      }
    }
  }

  static async json(requestPayload: RequestPayload) {
    try {
      const response = await this._fetch(requestPayload)
      console.log('response', response)
      const json = await response.json()
      return json
    } catch (error) {
      throw new Error(`Failed to parse JSON from ${requestPayload.url}: ${error}`)
    }
  }
}

/**
 * Fetch URL as HTML
 */
export const fetchUrlAsHtml = tool({
  description: 'Fetch URL content as HTML',
  inputSchema: RequestPayloadSchema,
  execute: async params => {
    const result = await Fetcher.html(params)
    return result
  }
})

/**
 * Fetch URL as JSON
 */
export const fetchUrlAsJson = tool({
  description: 'Fetch URL content as JSON',
  inputSchema: RequestPayloadSchema,
  execute: async params => {
    const result = await Fetcher.json(params)
    return result
  }
})

/**
 * Combined export of all fetch tools as a ToolSet
 */
export const fetchTools = {
  FetchUrlAsHtml: fetchUrlAsHtml,
  FetchUrlAsJson: fetchUrlAsJson
}
