import { createRequire } from 'node:module';
import { resolve } from 'node:path';

export function prepareSherpaArchive(projectDir: string, env: NodeJS.ProcessEnv): Promise<string> {
  const requireFromProject = createRequire(resolve(projectDir, 'package.json'));
  return requireFromProject('@siteed/sherpa-onnx.rn/prepare-archive')(env);
}
