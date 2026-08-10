export function buildGeminiGenerateImageParams(): Record<string, unknown> {
  return {
    responseModalities: ['TEXT', 'IMAGE'],
  };
}
