import { createContext } from 'react';

/** Whether the installed version is blocked by the update provider's confirmed minimum. */
export const RequiredUpdateContext = createContext(false);
