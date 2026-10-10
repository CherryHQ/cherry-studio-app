import { openaiCompatible } from './types';

export default openaiCompatible({
  id: 'opper',
  name: 'Opper',
  baseUrl: 'https://api.opper.ai/v3/compat',
  website: {
    apiKey: 'https://platform.opper.ai',
    docs: 'https://docs.opper.ai',
    models: 'https://opper.ai/models',
    official: 'https://opper.ai/',
  },
});
