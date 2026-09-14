import { ImageFormat, Skia, type SkImage } from '@shopify/react-native-skia';
import { randomUUID } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import { createWorkletRuntime, runOnRuntimeAsync } from 'react-native-worklets';

import { DocumentExportError, type CaptureExportHtml } from '@/shared/contracts/documentExport';

import type { ImageCapturePage, ImageCapturePlan, ImageCaptureTile } from './imageCapturePlan';

// A worklet runtime is a separate JS engine on its own thread. Bundle Mode evaluates the
// whole bundle inside every new one, and the library only releases it through GC. The
// surface lease already serializes captures, so one runtime serves every job.
let assemblyRuntime: ReturnType<typeof createWorkletRuntime> | undefined;

function getAssemblyRuntime() {
  assemblyRuntime ??= createWorkletRuntime({
    name: 'Document export WebP',
    initializer: initializeAssemblyWorklet,
  });
  return assemblyRuntime;
}

/** Each page is encoded and its canvas disposed before the next page starts. */
export async function captureWebpPages(
  view: Parameters<typeof captureRef>[0],
  pages: readonly ImageCapturePage[],
  prepareTile: (page: ImageCapturePage, tile: ImageCaptureTile) => Promise<void>,
  signal: AbortSignal,
  onProgress?: (current: number, total: number) => void,
): Promise<Awaited<ReturnType<CaptureExportHtml>>> {
  const outputs: Awaited<ReturnType<typeof captureWebp>>[] = [];
  const release = () => outputs.forEach((output) => output.release());
  try {
    for (const [index, page] of pages.entries()) {
      signal.throwIfAborted();
      onProgress?.(index + 1, pages.length);
      outputs.push(await captureWebp(view, page, (tile) => prepareTile(page, tile), signal));
    }
    signal.throwIfAborted();
    return {
      images: outputs.map((output, index) => ({
        uri: output.uri,
        width: pages[index].width,
        height: pages[index].height,
      })),
      release,
    };
  } catch (error) {
    release();
    throw error;
  }
}

export async function captureWebp(
  view: Parameters<typeof captureRef>[0],
  plan: ImageCapturePlan,
  prepareTile: (tile: ImageCaptureTile) => Promise<void>,
  signal: AbortSignal,
): Promise<{ uri: string; release(): void }> {
  let output: File | undefined;
  const release = () => {
    try {
      if (output?.exists) output.delete();
    } catch {
      /* The OS may already have evicted the temporary file. */
    }
  };

  try {
    // Keep the output surface in the worklet runtime, but only transfer one compressed
    // tile at a time. This follows the system screenshot architecture: tiles are
    // retained by the compositor, while the JavaScript side never builds an array
    // containing the whole document's PNG data.
    const runtime = getAssemblyRuntime();
    await runOnRuntimeAsync(runtime, beginAssemblyWorklet, plan.width, plan.height);
    for (const tile of plan.tiles) {
      signal.throwIfAborted();
      await prepareTile(tile);
      signal.throwIfAborted();
      const uri = await captureRef(view, { format: 'png', result: 'tmpfile' });
      try {
        signal.throwIfAborted();
        const encoded = await new File(uri).bytes();
        signal.throwIfAborted();
        await runOnRuntimeAsync(runtime, appendAssemblyTileWorklet, encoded, plan.width, tile);
      } finally {
        try {
          releaseCapture(uri);
        } catch {
          /* Best-effort native cache cleanup. */
        }
      }
    }
    signal.throwIfAborted();
    const bytes = await runOnRuntimeAsync(runtime, finishAssemblyWorklet);
    signal.throwIfAborted();
    if (!bytes?.length) throw new DocumentExportError('capture-failed');
    output = new File(Paths.cache, `document-export-${randomUUID()}.webp`);
    output.write(bytes);
    return { uri: output.uri, release };
  } catch (error) {
    if (assemblyRuntime) {
      try {
        await runOnRuntimeAsync(assemblyRuntime, abortAssemblyWorklet);
      } catch {
        /* Leftover state is disposed by the next capture's begin step. */
      }
    }
    release();
    throw error;
  }
}

type AssemblyRuntimeState = {
  surface: NonNullable<ReturnType<typeof Skia.Surface.Make>>;
  paint: ReturnType<typeof Skia.Paint>;
};

function initializeAssemblyWorklet() {
  'worklet';
  const globals = globalThis as typeof globalThis & {
    __documentExportAssembly?: AssemblyRuntimeState;
  };
  globals.__documentExportAssembly = undefined;
}

function beginAssemblyWorklet(width: number, height: number) {
  'worklet';
  const globals = globalThis as typeof globalThis & {
    __documentExportAssembly?: AssemblyRuntimeState;
  };
  const previous = globals.__documentExportAssembly;
  if (previous) {
    // A failed abort must not pin an earlier surface on the shared runtime.
    previous.paint.dispose();
    previous.surface.dispose();
    globals.__documentExportAssembly = undefined;
  }
  const surface = Skia.Surface.Make(width, height);
  if (!surface) throw new Error('Unable to allocate screenshot surface');
  globals.__documentExportAssembly = { surface, paint: Skia.Paint() };
}

function appendAssemblyTileWorklet(encoded: Uint8Array, width: number, tile: ImageCaptureTile) {
  'worklet';
  const globals = globalThis as typeof globalThis & {
    __documentExportAssembly?: AssemblyRuntimeState;
  };
  const state = globals.__documentExportAssembly;
  if (!state) throw new Error('Screenshot assembly is not initialized');
  const data = Skia.Data.fromBytes(encoded);
  let image: SkImage | null | undefined;
  try {
    image = Skia.Image.MakeImageFromEncoded(data);
    if (!image || Math.abs(image.width() - width) > 1 || Math.abs(image.height() - tile.height) > 1)
      throw new Error('Screenshot tile dimensions changed');
    state.surface
      .getCanvas()
      .drawImageRect(
        image,
        Skia.XYWHRect(0, 0, image.width(), image.height()),
        Skia.XYWHRect(0, tile.offset, width, tile.height),
        state.paint,
      );
  } finally {
    image?.dispose();
    data.dispose();
  }
}

function finishAssemblyWorklet() {
  'worklet';
  const globals = globalThis as typeof globalThis & {
    __documentExportAssembly?: AssemblyRuntimeState;
  };
  const state = globals.__documentExportAssembly;
  if (!state) throw new Error('Screenshot assembly is not initialized');
  let snapshot: SkImage | undefined;
  try {
    snapshot = state.surface.makeImageSnapshot();
    return snapshot.encodeToBytes(ImageFormat.WEBP, 100);
  } finally {
    snapshot?.dispose();
    state.paint.dispose();
    state.surface.dispose();
    globals.__documentExportAssembly = undefined;
  }
}

function abortAssemblyWorklet() {
  'worklet';
  const globals = globalThis as typeof globalThis & {
    __documentExportAssembly?: AssemblyRuntimeState;
  };
  const state = globals.__documentExportAssembly;
  if (!state) return;
  state.paint.dispose();
  state.surface.dispose();
  globals.__documentExportAssembly = undefined;
}
