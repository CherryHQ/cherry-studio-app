import { useState } from 'react';
import { Keyboard } from 'react-native';

import { MainHeaderAgentPickerSheet } from './MainHeaderAgentPickerSheet';

export function useMainHeaderAgentPicker(currentAgentId: string | undefined) {
  const [isOpen, setIsOpen] = useState(false);

  return {
    agentPickerSheet: (
      <MainHeaderAgentPickerSheet
        currentAgentId={currentAgentId}
        onClose={() => setIsOpen(false)}
        open={isOpen}
      />
    ),
    openAgentPicker: () => {
      Keyboard.dismiss();
      setIsOpen(true);
    },
  };
}
