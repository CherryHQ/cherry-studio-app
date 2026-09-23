import { type RefObject, useState } from 'react';
import { Keyboard, type View } from 'react-native';

import { useMainHeaderAgent } from './MainHeaderAgentLabel';
import { MainHeaderAgentPickerSheet } from './MainHeaderAgentPickerSheet';
import { MainHeaderView } from './MainHeaderView/MainHeaderView';

export function MainHeader({ blurTarget }: { blurTarget: RefObject<View | null> }) {
  const { agent, openNewSession } = useMainHeaderAgent();
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <>
      <MainHeaderView
        agent={agent}
        blurTarget={blurTarget}
        onNewChat={openNewSession}
        onAgentPress={() => {
          Keyboard.dismiss();
          setPickerOpen(true);
        }}
      />
      <MainHeaderAgentPickerSheet
        currentAgentId={agent?.id}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}
