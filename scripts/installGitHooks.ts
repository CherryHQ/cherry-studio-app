import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

type PrekPlatform = {
  os: string[];
  cpu: string[];
  libc?: string;
  armVersionMin?: number;
  armVersionMax?: number;
  packageName: string;
  binaryName: string;
};

function projectPrekBinary() {
  if (process.env.PREK_BINARY) return resolve(process.env.PREK_BINARY);

  const fromProject = createRequire(resolve('package.json'));
  const fromPrek = createRequire(fromProject.resolve('@j178/prek/package.json'));
  const platforms: PrekPlatform[] = fromPrek('./platforms.json');
  let libc: string | undefined;
  if (process.platform === 'linux') {
    const { header } = process.report.getReport() as { header: { glibcVersionRuntime?: string } };
    libc = header.glibcVersionRuntime ? 'glibc' : 'musl';
  }
  const arm = Number((process.config.variables as { arm_version?: number }).arm_version ?? 0);
  const target = platforms
    .filter(
      (spec) =>
        spec.os.includes(process.platform) &&
        spec.cpu.includes(process.arch) &&
        (!spec.libc || spec.libc === libc) &&
        arm >= (spec.armVersionMin ?? 0) &&
        arm <= (spec.armVersionMax ?? Infinity),
    )
    .sort((a, b) => (b.armVersionMin ?? 0) - (a.armVersionMin ?? 0))[0];
  if (!target) throw new Error(`No prek binary for ${process.platform}/${process.arch}`);
  return fromPrek.resolve(`${target.packageName}/${target.binaryName}`);
}

const commonDir = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
  encoding: 'utf8',
}).replace(/\r?\n$/, '');
const bytes = readFileSync(projectPrekBinary());
const digest = createHash('sha256').update(bytes).digest('hex');
const directory = join(commonDir, 'cherry-prek', digest);
const runner = join(directory, process.platform === 'win32' ? 'prek.exe' : 'prek');

// prek embeds its own executable path in the hooks. Publish a complete, immutable copy first.
if (!existsSync(runner)) {
  mkdirSync(directory, { recursive: true });
  const temporary = join(directory, randomUUID());
  try {
    writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o755 });
    renameSync(temporary, runner);
  } catch (error) {
    // Windows can refuse to replace a runner another installer already published and started.
    if (!existsSync(runner)) throw error;
  } finally {
    rmSync(temporary, { force: true });
  }
}

execFileSync(runner, ['install'], { stdio: 'inherit' });
