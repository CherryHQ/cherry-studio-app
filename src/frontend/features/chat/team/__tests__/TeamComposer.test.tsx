import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { startTeamSessionAndSend } from '@/frontend/appShell/conversation/team';
import { ComposerSurface } from '@/frontend/components/Composer';
import type { TeamAgentModule } from '@/shared/contracts/teamAgent';

import { TeamComposer } from '../TeamComposer';

jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: () => ({ alert: {} }),
  useToast: () => ({ toast: {} }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/frontend/appShell/conversation/team', () => ({
  startTeamSessionAndSend: jest.fn(),
  useTeamComposerDraft: () => ({ current: true }),
}));
jest.mock('@/frontend/components/Composer', () => ({
  ComposerSurface: () => null,
  useComposerState: () => ({ draft: 'hello' }),
  useComposerActions: () => ({ setDraft: jest.fn() }),
}));
jest.mock('../../components/ChatInput', () => ({ ChatInputSurface: () => null }));

it('blocks sending and session creation while an existing session is loading', async () => {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <TeamComposer
        module={{} as TeamAgentModule}
        contextKey="account"
        draftKey="draft"
        hasSessionTarget
        state={{ phase: 'loading', view: null, submitting: false }}
        agent={{ id: 'agent', name: 'Agent', canCreateSession: true }}
        onSessionCreated={jest.fn()}
      />,
    );
  });
  try {
    const { canSend, onSend } = renderer.root.findByType(ComposerSurface).props;
    expect(canSend).toBe(false);
    await expect(onSend({ text: 'hello', attachments: [] })).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(startTeamSessionAndSend).not.toHaveBeenCalled();
  } finally {
    act(() => renderer.unmount());
  }
});
