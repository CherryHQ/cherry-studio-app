import { openaiCompatible } from './types';

export default openaiCompatible({
  id: 'cheaperinference',
  name: 'Cheaper Inference',
  baseUrl: 'https://api.cheaperinference.com/v1',
  website: {
    apiKey: 'https://cheaperinference.com/signup',
    docs: 'https://cheaperinference.com',
    models: 'https://cheaperinference.com/#models',
    official: 'https://cheaperinference.com',
  },
});
