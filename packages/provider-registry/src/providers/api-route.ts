import { openaiCompatible } from './types';

export default openaiCompatible({
  id: 'api-route',
  name: 'API Route',
  baseUrl: 'https://global.api-route.com/v1',
  website: {
    apiKey: 'https://www.api-route.com',
    docs: 'https://www.api-route.com',
    models: 'https://global.api-route.com/v1/models',
    official: 'https://www.api-route.com',
  },
});
