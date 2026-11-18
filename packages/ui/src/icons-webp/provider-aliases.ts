import { PROVIDER_ID_ALIASES as DESKTOP_PROVIDER_ID_ALIASES } from '../icons/desktop-routing';

export const PROVIDER_ID_ALIASES: Readonly<Record<string, string>> = {
  ...DESKTOP_PROVIDER_ID_ALIASES,
  // The managed subscription provider shares desktop's CherryAI brand artwork.
  'cherryai-subscription': 'cherryin',
};
