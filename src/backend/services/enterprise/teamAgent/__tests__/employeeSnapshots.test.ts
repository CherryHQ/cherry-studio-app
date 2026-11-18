import { createEmployeeSnapshotParser } from '../employeeSnapshots';

it('joins chunked CRLF, multiline data and heartbeat frames without exposing partial snapshots', () => {
  const snapshots: unknown[] = [];
  const parse = createEmployeeSnapshotParser((value) => snapshots.push(value));
  parse(': heartbeat\r');
  parse('\n\r\ndata: {"type":"snapshot",\r');
  parse('\ndata: "snapshot":{"messages":[]}}\r');
  expect(snapshots).toEqual([]);
  parse('\n\r');
  parse('\n');
  expect(snapshots).toEqual([{ messages: [] }]);
});

it('does not replay or manufacture snapshots from other event types', () => {
  const snapshots: unknown[] = [];
  const parse = createEmployeeSnapshotParser((value) => snapshots.push(value));
  parse('data: {"type":"ping"}\n\n');
  parse('data: {"type":"snapshot","snapshot":{"run":null}}\n\n');
  expect(snapshots).toEqual([{ run: null }]);
});

it('bounds an unterminated snapshot before JSON decoding', () => {
  const parse = createEmployeeSnapshotParser(() => {});
  expect(() => parse('data: ' + 'x'.repeat(8 * 1024 * 1024))).toThrow('unsupported');
});
