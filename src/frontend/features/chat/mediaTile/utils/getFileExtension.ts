function splitFileName(name: string) {
  const trimmed = name.trim();
  const lastDotIndex = trimmed.lastIndexOf('.');

  if (lastDotIndex <= 0) {
    return { base: trimmed, extension: '' };
  }

  return { base: trimmed.slice(0, lastDotIndex), extension: trimmed.slice(lastDotIndex + 1) };
}

export function getFileExtension(name: string) {
  return splitFileName(name).extension.slice(0, 5).toUpperCase();
}

export function getFileBaseName(name: string) {
  return splitFileName(name).base;
}
