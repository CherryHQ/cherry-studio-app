import { extensionRegistry } from '@cherrystudio/ai-core/provider';

import { extensions } from '../extensions';
import { registerProviderExtensions } from '../factory';

describe('registerProviderExtensions', () => {
  it('registers every portable extension and remains idempotent', () => {
    registerProviderExtensions();
    registerProviderExtensions();

    for (const extension of extensions) {
      expect(extensionRegistry.has(extension.config.name)).toBe(true);
    }
  });
});
