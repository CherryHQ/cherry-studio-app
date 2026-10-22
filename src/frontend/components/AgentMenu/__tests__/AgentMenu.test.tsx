import type { ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { Agent } from '@/shared/data/types/agent';

import { AgentMenu } from '../AgentMenu';

const mockPush = jest.fn();
const mockUseAgentsApi = jest.fn();

jest.mock('@cherrystudio/ui/components', () => ({
  ActionMenu: (props: object) => jest.requireActual('react').createElement('ActionMenu', props),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/frontend/hooks/agent', () => ({ useAgentsApi: () => mockUseAgentsApi() }));

const standard = { id: 'agent-standard', mode: 'standard', name: 'Writer' } as Agent;
const minimal = { id: 'agent-minimal', mode: 'minimal', name: 'Quick' } as Agent;
const isStandard = (agent: Agent) => agent.mode === 'standard';

describe('AgentMenu', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockUseAgentsApi.mockReturnValue({ agents: [standard, minimal], isLoading: false });
  });

  it('lists the Agents that accept the content and hands the chosen one to the caller', () => {
    const onSelect = jest.fn();
    const items = menuItems(
      render(
        <AgentMenu accepts={isStandard} onSelect={onSelect}>
          <Trigger />
        </AgentMenu>,
      ),
    );

    expect(items.map((item) => item.label)).toEqual(['Writer']);
    act(() => items[0]!.onPress());
    expect(onSelect).toHaveBeenCalledWith(standard);
  });

  it('offers creating an Agent when none can receive the content', () => {
    mockUseAgentsApi.mockReturnValue({ agents: [minimal], isLoading: false });
    const onSelect = jest.fn();
    const items = menuItems(
      render(
        <AgentMenu accepts={isStandard} onSelect={onSelect}>
          <Trigger />
        </AgentMenu>,
      ),
    );

    expect(items.map((item) => item.label)).toEqual(['agent.create.title']);
    act(() => items[0]!.onPress());
    expect(mockPush).toHaveBeenCalledWith('/agents/new');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('opens nothing while the Agents load', () => {
    mockUseAgentsApi.mockReturnValue({ agents: [], isLoading: true });
    const items = menuItems(
      render(
        <AgentMenu onSelect={jest.fn()}>
          <Trigger />
        </AgentMenu>,
      ),
    );

    expect(items).toEqual([]);
  });
});

function Trigger() {
  return null;
}

function menuItems(renderer: ReactTestRenderer) {
  return renderer.root.findByType('ActionMenu' as never).props.items as {
    label: string;
    onPress: () => void;
  }[];
}

function render(element: ReactElement): ReactTestRenderer {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(element);
  });
  if (!renderer) throw new Error('Renderer was not created');
  return renderer;
}
