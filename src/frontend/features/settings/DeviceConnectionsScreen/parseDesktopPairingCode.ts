import {
  type DesktopPairingQr,
  DesktopPairingQrSchema,
} from '@/shared/data/api/schemas/desktopConnections';

/** Camera scans and pasted pairing content carry the same desktop invitation. */
export function parseDesktopPairingCode(value: string): DesktopPairingQr | undefined {
  try {
    return DesktopPairingQrSchema.parse(JSON.parse(value.trim()));
  } catch {
    return undefined;
  }
}
