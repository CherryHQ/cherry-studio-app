import { strToU8, zipSync } from 'fflate';

import { readSkillArchive, SKILL_ARCHIVE_MAX_BYTES } from '../skillArchive';

function directoryOffset(bytes: Uint8Array) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    bytes.length - 6,
    true,
  );
}

describe('Skill ZIP packages', () => {
  it('keeps embedded ZIP documents intact without treating their entries as package files', async () => {
    const document = zipSync({ 'word/document.xml': strToU8('<document/>') });
    const archive = zipSync({ 'SKILL.md': strToU8('Skill'), 'assets/template.docx': document });
    const files = await readSkillArchive(archive);
    expect([...files.keys()]).toEqual(['SKILL.md', 'assets/template.docx']);
    expect(files.get('assets/template.docx')).toEqual(document);
  });

  it.each<Record<string, Uint8Array>>([
    { '../SKILL.md': strToU8('Skill') },
    { '/SKILL.md': strToU8('Skill') },
    { 'A/SKILL.md': strToU8('Skill'), 'a/reference.md': strToU8('Reference') },
    { assets: strToU8('File'), 'assets/reference.md': strToU8('Reference') },
  ])('rejects traversal and file or case collisions before installation', async (files) => {
    await expect(readSkillArchive(zipSync(files))).rejects.toMatchObject({
      code: 'package-invalid',
    });
  });

  it('rejects symlinks and advertised oversized expansion before inflation', async () => {
    const symlink = zipSync({ 'SKILL.md': strToU8('Skill') });
    const view = new DataView(symlink.buffer);
    const offset = directoryOffset(symlink);
    view.setUint32(offset + 38, 0o120777 << 16, true);
    await expect(readSkillArchive(symlink)).rejects.toMatchObject({ code: 'package-invalid' });

    const oversized = zipSync({ 'SKILL.md': strToU8('Skill') });
    new DataView(oversized.buffer).setUint32(
      directoryOffset(oversized) + 24,
      SKILL_ARCHIVE_MAX_BYTES + 1,
      true,
    );
    await expect(readSkillArchive(oversized)).rejects.toMatchObject({ code: 'package-too-large' });
  });

  it('rejects corrupt file bytes instead of publishing a package with an invalid checksum', async () => {
    const archive = zipSync({ 'SKILL.md': strToU8('Skill') }, { level: 0 });
    const view = new DataView(archive.buffer);
    const start = 30 + view.getUint16(26, true) + view.getUint16(28, true);
    archive[start] = archive[start]! ^ 1;
    await expect(readSkillArchive(archive)).rejects.toMatchObject({ code: 'package-invalid' });
  });

  it('honors cancellation without converting it to a package error', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      readSkillArchive(zipSync({ 'SKILL.md': strToU8('Skill') }), controller.signal),
    ).rejects.toBe(controller.signal.reason);
  });
});
