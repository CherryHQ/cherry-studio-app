/**
 * Mark a message submitted while the assistant was already working as a
 * redirect within the current task. Only the model-facing copy is wrapped.
 */
export function wrapSteerReminder(text: string): string {
  const safe = text.replace(/<(\/?\s*system-reminder\b[^>]*)>/gi, '&lt;$1>');
  return [
    '<system-reminder>',
    'The user sent the following message:',
    safe,
    '',
    'Please address this message and continue with your tasks.',
    '</system-reminder>',
  ].join('\n');
}
