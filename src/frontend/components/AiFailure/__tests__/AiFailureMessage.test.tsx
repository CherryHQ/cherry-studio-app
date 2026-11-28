import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { act, create } from 'react-test-renderer';

import { loadLocaleCatalog } from '@/frontend/i18n/resources';
import { APP_LANGUAGES, DEFAULT_APP_LANGUAGE } from '@/shared/utils/languages';

import { AiFailureMessage } from '../AiFailureMessage';

jest.mock('@/frontend/data', () => ({ useQuery: () => ({ data: [] }) }));
jest.mock('@/frontend/components/MessageDetail', () => ({ MessageDetailText: () => null }));
jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  return { MessagePart: { Error: (props: object) => createElement('MessagePartError', props) } };
});

const englishCatalog = loadLocaleCatalog(DEFAULT_APP_LANGUAGE);

describe('AiFailureMessage', () => {
  test.each(APP_LANGUAGES.map(({ value }) => value))(
    'shows the localized streaming recovery inline for %s',
    async (language) => {
      const catalog = loadLocaleCatalog(language);
      const i18n = createInstance();
      await i18n.init({
        lng: language,
        fallbackLng: false,
        keySeparator: false,
        resources: { [language]: { translation: catalog } },
      });
      let renderer!: ReturnType<typeof create>;
      act(() => {
        renderer = create(
          <I18nextProvider i18n={i18n}>
            <AiFailureMessage
              data={{
                code: 'EXECUTION_FAILED',
                reasonCode: 'unknown',
                retryable: false,
                message: 'English diagnostic detail',
                source: { layer: 'provider', code: 'non_streaming_mode_unsupported' },
              }}
            />
          </I18nextProvider>,
        );
      });
      const { title, message } = renderer.root.findByType('MessagePartError').props;
      expect(title).toBe(catalog['chat.errorPart.reason.streamingRequired']);
      expect(message).toBe(catalog['chat.errorPart.message.streamingRequired']);
      expect(typeof message).toBe('string');
      expect(message).not.toBe('English diagnostic detail');
      expect(renderer.root.findAllByType('MessagePartError')).toHaveLength(1);
      if (language === 'en-US') {
        expect(title).toBe('Streaming required');
        expect(message).toBe(
          'This model’s transport requires streaming. Turn on streaming for this model.',
        );
      } else {
        expect(message).not.toBe(englishCatalog['chat.errorPart.message.streamingRequired']);
      }
      act(() => renderer.unmount());
    },
  );
});
