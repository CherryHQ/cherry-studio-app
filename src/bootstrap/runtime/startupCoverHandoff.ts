let resolveHandoff: (() => void) | undefined;
let isHandoffComplete = false;

const handoffPromise = new Promise<void>((resolve) => {
  resolveHandoff = resolve;
});

export function reportStartupCoverPresented() {
  if (isHandoffComplete) {
    return;
  }

  isHandoffComplete = true;
  resolveHandoff?.();
  resolveHandoff = undefined;
}

export function waitForStartupCoverPresented() {
  return handoffPromise;
}
