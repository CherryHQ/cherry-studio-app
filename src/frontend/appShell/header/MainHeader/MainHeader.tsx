import { type RefObject, useState } from 'react';
import { Keyboard, type ViewInstance } from 'react-native';

import { AgentEditor } from '@/frontend/components/AgentEditor';

import type { HeaderToolbarAction } from '../components/HeaderAction';
import { useMainHeaderAgent } from './MainHeaderAgentLabel';
import { MainHeaderView } from './MainHeaderView/MainHeaderView';
import { UnifiedAgentPicker } from './UnifiedAgentPicker';

export function MainHeader({
  blurTarget,
  hidden,
  actions,
  selection,
}: {
  blurTarget: RefObject<ViewInstance | null>;
  hidden?: boolean;
  actions?: readonly HeaderToolbarAction[];
  selection?: { selectedCount: number; onExit(): void };
}) {
  const { agent, openNewSession } = useMainHeaderAgent();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string>();
  return (
    <>
      <MainHeaderView
        agent={agent}
        blurTarget={blurTarget}
        hidden={hidden}
        actions={actions}
        selection={selection}
        onNewChat={openNewSession}
        onAgentPress={() => {
          Keyboard.dismiss();
          setEditingAgentId(agent?.id);
        }}
        onAgentSwitch={() => {
          Keyboard.dismiss();
          setPickerOpen(true);
        }}
      />
      <UnifiedAgentPicker
        currentAgentId={agent?.id}
        currentAgentSource="local"
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
      />
      {editingAgentId ? (
        <AgentEditor
          agentId={editingAgentId}
          onClose={() => setEditingAgentId(undefined)}
          presentation="sheet"
        />
      ) : null}
    </>
  );
}
