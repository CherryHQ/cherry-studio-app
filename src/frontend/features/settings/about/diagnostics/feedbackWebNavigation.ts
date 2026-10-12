import { diagnosticStatusPageUrl } from '@/shared/contracts/diagnostics';

export function feedbackWebNavigationAction(url: string, reportId: string) {
  if (url === 'about:blank') return 'allow';
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    if (parsed.href === diagnosticStatusPageUrl(reportId)) return 'allow';
    if (parsed.origin === 'https://github.com' && !parsed.username && !parsed.password)
      return 'external';
  } catch {
    // A malformed or unsupported navigation has no destination.
  }
  return 'block';
}
