// Build-Tools 37 labels signers by signature scheme. Older versions use a number or SDK range.
const APK_SIGNER_SHA256 =
  /^(?:Signer (?:#\d+|\(minSdkVersion=[^\r\n]*\))|V\d+(?:\.\d+)?(?: Hybrid [\w-]+)? Signer:) certificate SHA-256 digest:[ \t]*([a-f0-9]{64})[ \t]*$/im;

export function readApkSignerSha256(output: string): string | undefined {
  return APK_SIGNER_SHA256.exec(output)?.[1]?.toLowerCase();
}
