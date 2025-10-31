import { Model, ModelHealth, Provider } from '@/types/assistant'
import { loggerService } from './LoggerService'
import { checkApi } from './ApiService'

const logger = loggerService.withContext('ModelHealthService')

export type ModelHealthCheckResult = ModelHealth

/**
 * Check health of a single model
 * @param provider Provider to test
 * @param model Model to test
 * @param timeoutMs Timeout in milliseconds (default: 30000)
 * @returns ModelHealth result
 */
export async function checkModelHealth(
  provider: Provider,
  model: Model,
  timeoutMs: number = 30000
): Promise<ModelHealth> {
  const startTime = Date.now()

  try {
    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Health check timeout')), timeoutMs)
    })

    // Race between the actual check and timeout
    await Promise.race([checkApi(provider, model), timeoutPromise])

    const endTime = Date.now()
    const latency = (endTime - startTime) / 1000 // Convert to seconds

    return {
      modelId: model.id,
      status: 'healthy',
      latency,
      lastChecked: Date.now()
    }
  } catch (error) {
    const endTime = Date.now()
    const latency = (endTime - startTime) / 1000

    logger.error(`Health check failed for model ${model.id}:`, error as Error)

    return {
      modelId: model.id,
      status: 'unhealthy',
      latency,
      lastChecked: Date.now(),
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Check health of multiple models in parallel
 * @param provider Provider to test
 * @param models Models to test
 * @param timeoutMs Timeout in milliseconds for each model (default: 30000)
 * @returns Array of ModelHealth results
 */
export async function checkModelsHealth(
  provider: Provider,
  models: Model[],
  timeoutMs: number = 30000
): Promise<ModelHealth[]> {
  logger.info(`Starting health check for ${models.length} models`)

  // Create promises for all model checks
  const checkPromises = models.map(model => checkModelHealth(provider, model, timeoutMs))

  // Wait for all checks to complete (using allSettled to handle individual failures)
  const results = await Promise.allSettled(checkPromises)

  // Extract successful results and handle failures
  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value
    } else {
      // If the check itself failed (not the API call), return an unhealthy status
      logger.error(`Failed to check health for model ${models[index].id}:`, result.reason)
      return {
        modelId: models[index].id,
        status: 'unhealthy',
        lastChecked: Date.now(),
        error: result.reason instanceof Error ? result.reason.message : 'Health check failed'
      }
    }
  })
}

export const modelHealthService = {
  checkModelHealth,
  checkModelsHealth
}
