import { loggerService } from '@logger';
import { Component, type ErrorInfo, type ReactNode } from 'react';

const logger = loggerService.withContext('ErrorBoundary');

type ErrorBoundaryProps = {
  children: ReactNode;
  /** Rendered in place of the failed subtree. `reset` renders the children again. */
  fallback: (reset: () => void) => ReactNode;
  /** Fixed reporting operation; production error logs that name one reach crash reporting. */
  operation: string;
  /** Any change renders the children again, so new data gets its own attempt. */
  resetKeys?: readonly unknown[];
};

type ErrorBoundaryState = {
  hasError: boolean;
  resetKeys: readonly unknown[] | undefined;
};

/**
 * Contains a render failure to the subtree it wraps. React only offers this
 * through a class component; everything else stays with the owner's fallback.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, resetKeys: this.props.resetKeys };

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { hasError: true };
  }

  static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState,
  ): Partial<ErrorBoundaryState> | null {
    if (haveSameKeys(props.resetKeys, state.resetKeys)) return null;
    return { hasError: false, resetKeys: props.resetKeys };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    logger.error('Render failed', toError(error), {
      componentStack: info.componentStack,
      operation: this.props.operation,
    });
  }

  private reset = () => {
    this.setState({ hasError: false });
  };

  render() {
    return this.state.hasError ? this.props.fallback(this.reset) : this.props.children;
  }
}

function haveSameKeys(
  next: readonly unknown[] | undefined,
  previous: readonly unknown[] | undefined,
) {
  if (next === previous) return true;
  if (!next || !previous || next.length !== previous.length) return false;
  return next.every((key, index) => Object.is(key, previous[index]));
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}
