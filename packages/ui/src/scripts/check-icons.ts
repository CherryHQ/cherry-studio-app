import { checkGeneratedIcons } from './generate-icons';

void checkGeneratedIcons()
  .then(() => process.stdout.write('Generated icon assets are current.\n'))
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
