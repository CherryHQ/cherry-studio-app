import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const source = readFileSync(
  join(
    dirname(require.resolve('expo-calendar/package.json')),
    'ios/Requesters/CalendarPermissionsRequester.swift',
  ),
  'utf8',
);

// Guard the installed requester: Expo derives canAskAgain from this scoped status.
describe('iOS calendar full-access request patch', () => {
  test('keeps a refused write-only upgrade denied across application launches', () => {
    expect(source).toContain(
      'private let fullAccessRequestedKey = "cherry.calendar.fullAccessRequested"',
    );
    expect(source).toMatch(
      /case \.writeOnly:[\s\S]*?status = UserDefaults\.standard\.bool\(forKey: fullAccessRequestedKey\)\s*\? EXPermissionStatusDenied\s*: EXPermissionStatusUndetermined/,
    );
    expect(source).toMatch(
      /if let error \{\s*reject\([^\n]+\)\s*\} else \{\s*UserDefaults\.standard\.set\(true, forKey: self\.fullAccessRequestedKey\)\s*resolve\(self\.getPermissions\(\)\)/,
    );
  });

  test('allows a new full-access inquiry after a system privacy reset', () => {
    expect(source).toMatch(
      /case \.notDetermined:[\s\S]*?UserDefaults\.standard\.removeObject\(forKey: fullAccessRequestedKey\)\s*status = EXPermissionStatusUndetermined/,
    );
  });
});
