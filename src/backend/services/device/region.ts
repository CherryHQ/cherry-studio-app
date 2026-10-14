import { getCalendars, getLocales } from 'expo-localization';

/**
 * Whether the device is set up for mainland China, judged from its region and time zone.
 *
 * This reads settings rather than the network: it costs nothing and needs no lookup service, but a
 * traveller or a proxied connection can make it wrong, so callers keep a path that works either way.
 */
export function isDeviceRegionMainlandChina(): boolean {
  const regionCode = getLocales()[0]?.regionCode?.toUpperCase();
  const timeZone = getCalendars()[0]?.timeZone;
  return regionCode === 'CN' || timeZone === 'Asia/Shanghai' || timeZone === 'Asia/Urumqi';
}
