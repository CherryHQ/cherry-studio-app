import {
  effectiveSkillStatus,
  mergeSkillReasons,
  skillReasonRoute,
  skillStatusTone,
} from '../skillStatus';

describe('skill status helpers', () => {
  it('maps admission outcomes to tones and prefers the Agent evaluation', () => {
    expect(skillStatusTone('ready')).toBe('success');
    expect(skillStatusTone('unsupported')).toBe('danger');
    expect(skillStatusTone('setup-required')).toBe('default');
    expect(skillStatusTone('unknown')).toBe('default');
    expect(effectiveSkillStatus({ status: 'ready', reasons: [] })).toBe('ready');
    expect(
      effectiveSkillStatus(
        { status: 'ready', reasons: [] },
        { status: 'setup-required', reasons: [{ code: 'capability-disabled', subject: 'web' }] },
      ),
    ).toBe('setup-required');
  });

  it('routes repairable reasons and deduplicates merged reasons', () => {
    expect(skillReasonRoute('plugin-not-connected')).toBe('/plugins');
    expect(skillReasonRoute('execution-unsupported')).toBeNull();
    expect(
      mergeSkillReasons(
        {
          status: 'setup-required',
          reasons: [{ code: 'permission-denied', subject: 'calendar.read' }],
        },
        {
          status: 'setup-required',
          reasons: [
            { code: 'permission-denied', subject: 'calendar.read' },
            { code: 'capability-disabled', subject: 'calendar' },
          ],
        },
      ),
    ).toEqual([
      { code: 'permission-denied', subject: 'calendar.read' },
      { code: 'capability-disabled', subject: 'calendar' },
    ]);
  });
});
