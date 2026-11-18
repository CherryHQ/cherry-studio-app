import { createInstance } from 'i18next';

import en from '@/frontend/i18n/locales/en-us.json';
import { SkillsError, type SkillInspection, type SkillsErrorCode } from '@/shared/contracts/skills';

import {
  describeInstallOutcome,
  errorCode,
  firstIssueReason,
  formatInstallOutcome,
  planInstallTargets,
  resolveFooterNotice,
} from '../installFeedback';

function inspection(candidateId: string, isValid = true): SkillInspection {
  return {
    candidate: {
      candidateId,
      name: candidateId,
      description: 'A Skill',
      source: {
        registry: 'cherryin',
        locator: candidateId,
        url: 'https://skills.cherryin.ai/skills/example',
        revision: 'revision',
      },
      author: null,
      version: null,
      tags: [],
      installedSkillId: null,
    },
    package: isValid
      ? {
          name: candidateId,
          description: 'A Skill',
          author: null,
          version: null,
          license: null,
          compatibility: null,
          tags: [],
          invocation: { modelInvocable: true, userInvocable: true },
          manifest: [],
          contentHash: 'revision',
          instructions: '# Skill',
        }
      : null,
    issues: [],
    limitations: null,
  };
}

describe('installation feedback reasons', () => {
  it('D1 uses only the first issue and preserves its subject for the toast and footer', () => {
    const item = inspection('invalid', false);
    item.issues = [
      { code: 'file-too-large', subject: 'assets/manual.pdf' },
      { code: 'entry-missing', subject: null },
    ];
    const reason = {
      key: 'skills.issue.file-too-large',
      params: { subject: 'assets/manual.pdf' },
    };
    expect(firstIssueReason(item.issues)).toEqual(reason);
    expect(
      resolveFooterNotice({ inspections: [item], isCollection: false, operationError: null }),
    ).toEqual(reason);
  });

  it('D1 falls back to invalidPackage when an invalid single package has no issues', () => {
    expect(firstIssueReason([])).toBeNull();
    expect(
      resolveFooterNotice({
        inspections: [inspection('invalid', false)],
        isCollection: false,
        operationError: null,
      }),
    ).toEqual({ key: 'skills.candidate.invalidPackage', params: {} });
  });

  it('D1 supplies an empty subject for an issue without one', () => {
    expect(firstIssueReason([{ code: 'entry-missing', subject: null }])).toEqual({
      key: 'skills.issue.entry-missing',
      params: { subject: '' },
    });
  });

  it('D6 leaves a valid collection with zero selections free of an invalid-package notice', () => {
    expect(
      resolveFooterNotice({
        inspections: [inspection('valid')],
        isCollection: true,
        operationError: null,
      }),
    ).toBeNull();
  });

  it('D6 reports invalidPackage only when every member of a nonempty collection is invalid', () => {
    const invalid = inspection('invalid', false);
    invalid.issues = [{ code: 'entry-missing', subject: null }];
    expect(
      resolveFooterNotice({
        inspections: [invalid, inspection('also-invalid', false)],
        isCollection: true,
        operationError: null,
      }),
    ).toEqual({ key: 'skills.candidate.invalidPackage', params: {} });
    expect(
      resolveFooterNotice({
        inspections: [invalid, inspection('valid')],
        isCollection: true,
        operationError: null,
      }),
    ).toBeNull();
  });

  it.each([null, []])('D6 does not call an unchecked or empty collection invalid (%p)', (items) => {
    expect(
      resolveFooterNotice({ inspections: items, isCollection: true, operationError: null }),
    ).toBeNull();
  });

  it('D2 keeps the operation error visible when inspections provide no more specific reason', () => {
    expect(
      resolveFooterNotice({
        inspections: null,
        isCollection: false,
        operationError: 'candidate-expired',
      }),
    ).toEqual({ key: 'skills.error.candidate-expired', params: {} });
  });

  it('D1 and D6 inspection notices take priority over an old operation error', () => {
    for (const isCollection of [false, true]) {
      expect(
        resolveFooterNotice({
          inspections: [inspection('invalid', false)],
          isCollection,
          operationError: 'source-unreachable',
        }),
      ).toEqual({ key: 'skills.candidate.invalidPackage', params: {} });
    }
  });

  it('D2 preserves a typed error with an existing translation', () => {
    expect(errorCode(new SkillsError('not-found', 'Missing'))).toBe('not-found');
  });

  it.each([
    new Error('Network failure'),
    new SkillsError('unknown-code' as SkillsErrorCode, 'Unknown'),
    new SkillsError('storage-unavailable', 'No existing translation'),
    new SkillsError('content-changed', 'No existing translation'),
  ])('D2 maps unknown or untranslated errors to source-unreachable (%p)', (error) => {
    expect(errorCode(error)).toBe('source-unreachable');
    expect(
      resolveFooterNotice({
        inspections: null,
        isCollection: false,
        operationError: errorCode(error),
      }),
    ).toEqual({ key: 'skills.error.source-unreachable', params: {} });
  });
});

describe('installation targets', () => {
  function targets(inspections: SkillInspection[] | null, selected: ReadonlySet<string>) {
    return planInstallTargets({
      inspections,
      selected,
      isInstalled: (item) => item.candidate.candidateId === 'installed',
      isInstallable: (item) => item.package !== null,
    });
  }

  it.each([null, []])(
    'D3/D4 leaves empty targets identifiable for not-found, avoiding 0/0 (%p)',
    (items) => {
      expect(targets(items, new Set())).toEqual([]);
    },
  );

  it('D4 returns no targets for a valid collection with zero selections', () => {
    expect(targets([inspection('valid')], new Set())).toEqual([]);
  });

  it('installs only selected, installable, uninstalled members in inspection order', () => {
    const valid = inspection('valid');
    expect(
      targets(
        [inspection('invalid', false), inspection('unselected'), inspection('installed'), valid],
        new Set(['invalid', 'installed', 'valid']),
      ),
    ).toEqual([valid]);
  });
});

describe('installation outcome labels', () => {
  const translations = createInstance();
  beforeAll(async () => {
    await translations.init({
      lng: 'en',
      resources: { en: { translation: en } },
      keySeparator: false,
      interpolation: { escapeValue: false },
    });
  });

  it('D5 reports a partial success with the real counts and a full expired reason on a second line', () => {
    const outcome = describeInstallOutcome({ installed: 1, failed: 1, expired: true });
    expect(outcome).toMatchObject({
      key: 'skills.marketplace.installResult',
      params: { installed: 1, failed: 1 },
    });
    expect(formatInstallOutcome(outcome, translations.t)).toBe(
      'Installed: 1 · Failed: 1\nThis Skill needs to be resolved again.',
    );
  });

  it('D5 reports preparation expiry as zero installed and one failed operation', () => {
    expect(
      formatInstallOutcome(
        describeInstallOutcome({ installed: 0, failed: 1, expired: true }),
        translations.t,
      ),
    ).toBe('Installed: 0 · Failed: 1\nThis Skill needs to be resolved again.');
  });

  it('keeps a nonexpired batch label to the existing count translation alone', () => {
    expect(
      formatInstallOutcome(
        describeInstallOutcome({ installed: 1, failed: 1, expired: false }),
        translations.t,
      ),
    ).toBe('Installed: 1 · Failed: 1');
  });
});
