import { openaiCompatible } from './types';

export default openaiCompatible({
  id: 'atlascloud',
  name: 'Atlas Cloud',
  baseUrl: 'https://api.atlascloud.ai/v1',
  website: {
    apiKey: 'https://www.atlascloud.ai/',
    docs: 'https://www.atlascloud.ai/',
    models: 'https://www.atlascloud.ai/',
    official: 'https://www.atlascloud.ai/',
  },
});
