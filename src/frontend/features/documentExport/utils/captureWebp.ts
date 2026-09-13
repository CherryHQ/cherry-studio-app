import { ImageFormat, Skia, type SkImage } from '@shopify/react-native-skia';
import { randomUUID } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import { createWorkletRuntime, runOnRuntimeAsync } from 'react-native-worklets';

import { DocumentExportError, type CaptureExportHtml } from '@/shared/contracts/documentExport';

import type { ImageCapturePlan, ImageCaptureTile } from './imageCapturePlan';

export async function captureWebp(
  view: Parameters<typeof captureRef>[0],
  plan: ImageCapturePlan,
  prepareTile: (tile: ImageCaptureTile) => Promise<void>,
  signal: AbortSignal,
): Promise<Pick<Awaited<ReturnType<CaptureExportHtml>>, 'uri' | 'release'>> {
  let output: File | undefined;
  let runtime: ReturnType<typeof createWorkletRuntime> | undefined;
  const release = () => {
    try {
      if (output?.exists) output.delete();
    } catch {
      /* The OS may already have evicted the temporary file. */
    }
  };

  try {
    // Keep the output surface in one native worklet runtime, but only transfer one
    // compressed tile at a time. This follows the system screenshot architecture:
    // tiles are retained by the compositor, while the JavaScript side never builds
    // an array containing the whole document's PNG data.
    const assemblyRuntime = createWorkletRuntime({
      name: 'Document export WebP',
      initializer: initializeAssemblyWorklet,
    });
    runtime = assemblyRuntime;
    await runOnRuntimeAsync(assemblyRuntime, beginAssemblyWorklet, plan.width, plan.height);
    for (const tile of plan.tiles) {
      signal.throwIfAborted();
      await prepareTile(tile);
      signal.throwIfAborted();
      const uri = await captureRef(view, { format: 'png', result: 'tmpfile' });
      try {
        signal.throwIfAborted();
        const encoded = await new File(uri).bytes();
        signal.throwIfAborted();
        await runOnRuntimeAsync(
          assemblyRuntime,
          appendAssemblyTileWorklet,
          encoded,
          plan.width,
          tile,
        );
      } finally {
        try {
          releaseCapture(uri);
        } catch {
          /* Best-effort native cache cleanup. */
        }
      }
    }
    signal.throwIfAborted();
    const bytes = await runOnRuntimeAsync(assemblyRuntime, finishAssemblyWorklet);
    signal.throwIfAborted();
    if (!bytes?.length) throw new DocumentExportError('capture-failed');
    output = new File(Paths.cache, `document-export-${randomUUID()}.webp`);
    output.write(bytes);
    return { uri: output.uri, release };
  } catch (error) {
    if (runtime) {
      try {
        await runOnRuntimeAsync(runtime, abortAssemblyWorklet);
      } catch {
        /* The runtime may already be torn down after cancellation. */
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
