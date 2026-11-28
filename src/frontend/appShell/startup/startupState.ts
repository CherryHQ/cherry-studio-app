export const STARTUP_CONTENT_TIMEOUT_MS = 3_000;

type StartupExitState = {
  bootstrapReady: boolean;
  contentReady: boolean;
  timedOut: boolean;
};

export function isStartupReadyToExit({ bootstrapReady, contentReady, timedOut }: StartupExitState) {
  return bootstrapReady && (contentReady || timedOut);
}
