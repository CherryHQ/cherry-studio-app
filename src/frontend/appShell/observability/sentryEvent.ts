import type { Breadcrumb, ErrorEvent, Event, StackFrame } from '@sentry/react-native';

import policy from '../../../../modules/crash-reporting/reportingPolicy.json';

const IDENTIFIER = /^[a-zA-Z_$][a-zA-Z0-9_$.-]{0,99}$/;
const SYMBOL = /^[a-zA-Z0-9_$ .:<>()[\]+*~&,-]{1,200}$/;
const CANCELED_ERRORS = new Set(['AbortError', 'CanceledError', 'CancellationError']);
const CANCELED_CODES = new Set(['ABORT_ERR', 'ERR_CANCELED']);
const ERROR_CODES = new Set([
  'BAD_REQUEST',
  'CONFLICT',
  'INTERNAL_SERVER_ERROR',
  'INVALID_OPERATION',
  'METHOD_NOT_ALLOWED',
  'NOT_FOUND',
  'VALIDATION_ERROR',
]);
type DebugImage = NonNullable<NonNullable<ErrorEvent['debug_meta']>['images']>[number];

export function isExpectedSentryError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = 'code' in error ? error.code : undefined;
  return CANCELED_ERRORS.has(error.name) || (typeof code === 'string' && CANCELED_CODES.has(code));
}

export function sentryIdentifier(value: unknown): string | undefined {
  return typeof value === 'string' && IDENTIFIER.test(value) ? value : undefined;
}

function sourceFile(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const name = value.split(/[?#]/, 1)[0]?.split(/[/\\]/).pop();
  return name && /^[a-zA-Z0-9_.-]+\.(?:bundle|js|jsx|ts|tsx|hbc|wasm)$/.test(name)
    ? `app:///${name}`
    : undefined;
}

function sanitizeFrame(frame: StackFrame): StackFrame {
  return {
    filename: sourceFile(frame.filename),
    function: frame.function && SYMBOL.test(frame.function) ? frame.function : undefined,
    lineno: frame.lineno,
    colno: frame.colno,
    in_app: frame.in_app,
    platform: frame.platform,
    instruction_addr: frame.instruction_addr,
    addr_mode: frame.addr_mode,
    debug_id: frame.debug_id,
  };
}

export function sanitizeSentryBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  if (crumb.category !== 'app.diagnostic' || !policy.breadcrumbCodes.includes(crumb.message ?? ''))
    return null;
  return {
    category: 'app.diagnostic',
    message: crumb.message,
    level: 'info',
    timestamp:
      typeof crumb.timestamp === 'number' && Number.isFinite(crumb.timestamp)
        ? crumb.timestamp
        : undefined,
  };
}

/** Classify known framework errors without returning any part of their message. */
function errorKind(message: string | undefined): string | undefined {
  if (!message) return undefined;
  if (message.includes('Invalid hook call')) return 'invalid_hook_call';
  if (/Rendered (?:more|fewer) hooks|change in the order of Hooks/.test(message))
    return 'hook_order';
  if (/Maximum update depth exceeded|Too many re-renders/.test(message)) return 'render_loop';
  if (message.includes('Element type is invalid')) return 'invalid_element';
  if (/Cannot find native module|TurboModuleRegistry.getEnforcing/.test(message))
    return 'native_module_missing';
  return undefined;
}

function sanitizeDebugImage(image: DebugImage): DebugImage[] {
  if (image.type === 'macho') {
    return [
      {
        type: image.type,
        debug_id: image.debug_id,
        image_addr: image.image_addr,
        image_size: image.image_size,
      },
    ];
  }
  const file = sourceFile(image.code_file);
  return file ? [{ type: image.type, debug_id: image.debug_id, code_file: file }] : [];
}

/** Construct the payload from allowed fields. Free-form messages can contain complete AI responses. */
export function sanitizeSentryEvent(event: Event, originalException?: unknown): ErrorEvent | null {
  const exceptions = event.exception?.values;
  if (
    event.type !== undefined ||
    !exceptions?.length ||
    exceptions.some((error) => CANCELED_ERRORS.has(error.type ?? ''))
  ) {
    return null;
  }

  const tags: Record<string, string> = { 'event.origin': 'javascript' };
  for (const key of ['module', 'operation']) {
    const value = sentryIdentifier(event.tags?.[key]);
    if (value) tags[key] = value;
  }
  const kind = errorKind(exceptions[0]?.value);
  if (kind) tags['error.kind'] = kind;
  const code =
    originalException instanceof Error && 'code' in originalException
      ? originalException.code
      : undefined;
  if (typeof code === 'string' && ERROR_CODES.has(code)) tags['error.code'] = code;

  const contexts: ErrorEvent['contexts'] = {};
  for (const [key, fields] of Object.entries({
    os: ['name', 'version', 'build', 'kernel_version'],
    device: ['family', 'model', 'model_id', 'arch', 'simulator', 'memory_size'],
  })) {
    const context = event.contexts?.[key];
    if (context)
      contexts[key] = Object.fromEntries(
        Object.entries(context).filter(([field]) => fields.includes(field)),
      );
  }

  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    release: event.release,
    dist: event.dist,
    environment: event.environment,
    sdk: event.sdk,
    contexts,
    tags,
    breadcrumbs: event.breadcrumbs
      ?.flatMap((crumb) => {
        const clean = sanitizeSentryBreadcrumb(crumb);
        return clean ? [clean] : [];
      })
      .slice(-policy.maxBreadcrumbs),
    exception: {
      values: exceptions.map((error) => ({
        type: sentryIdentifier(error.type) ?? 'Error',
        value: 'Error details omitted for privacy',
        stacktrace: error.stacktrace
          ? { frames: error.stacktrace.frames?.map(sanitizeFrame) }
          : undefined,
        mechanism: error.mechanism
          ? {
              type: sentryIdentifier(error.mechanism.type) ?? 'generic',
              handled: error.mechanism.handled,
              synthetic: error.mechanism.synthetic,
            }
          : undefined,
      })),
    },
    debug_meta: event.debug_meta
      ? {
          images: event.debug_meta.images?.flatMap(sanitizeDebugImage),
        }
      : undefined,
  };
}
