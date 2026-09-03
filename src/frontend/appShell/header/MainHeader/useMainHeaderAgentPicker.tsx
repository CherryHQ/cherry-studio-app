import { useState } from 'react';

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
    openAgentPicker: () => setIsOpen(true),
  };
}
