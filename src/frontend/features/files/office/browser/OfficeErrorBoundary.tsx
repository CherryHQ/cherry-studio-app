import { Component, type ReactNode } from 'react';

import { officeDiagnostic } from '../officeDiagnostics';
import type { OfficeStatus } from '../officePreview';

/** Native owns the error surface and remounts the complete DOM document on retry. */
export class OfficeErrorBoundary extends Component<
  { children: ReactNode; onStatus: (patch: Partial<OfficeStatus>) => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.onStatus({
      phase: 'error',
      busy: false,
      error: 'failed',
      diagnostic: officeDiagnostic('react-render', error),
    });
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
