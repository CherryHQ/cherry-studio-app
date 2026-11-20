import { TeamAgentError } from '@/shared/contracts/teamAgent';

/** Bounded SSE frames. Heartbeats are ignored; only complete validated snapshot events escape. */
export function createEmployeeSnapshotParser(snapshot: (data: unknown) => void) {
  let line = '';
  let data: string[] = [];
  let size = 0;
  let carriageReturn = false;
  const finishLine = () => {
    if (!line) {
      if (data.length) {
        let event: unknown;
        try {
          event = JSON.parse(data.join('\n'));
        } catch {
          throw new TeamAgentError('unsupported');
        }
        if (
          event &&
          typeof event === 'object' &&
          'type' in event &&
          event.type === 'snapshot' &&
          'snapshot' in event
        )
          snapshot(event.snapshot);
      }
      data = [];
      size = 0;
    } else if (line.startsWith('data:')) {
      data.push(line.slice(5).replace(/^ /, ''));
    }
    line = '';
  };
  const append = (text: string) => {
    size += text.length;
    if (size > 8 * 1024 * 1024) throw new TeamAgentError('unsupported');
    line += text;
  };
  return (input: string) => {
    if (!input) return;
    const chunk = carriageReturn && input.startsWith('\n') ? input.slice(1) : input;
    carriageReturn = false;
    let start = 0;
    for (const match of chunk.matchAll(/\r\n|\r|\n/g)) {
      append(chunk.slice(start, match.index));
      finishLine();
      start = match.index + match[0].length;
      carriageReturn = match[0] === '\r' && start === chunk.length;
    }
    append(chunk.slice(start));
  };
}
