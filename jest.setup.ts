import { randomUUID as mockRandomUUID } from 'node:crypto';

global.__DEV__ = true;

// expo-crypto's jest-expo auto-mock is an empty stub (randomUUID() returns
// undefined), so anything depending on a real id breaks under test.
jest.mock('expo-crypto', () => ({ randomUUID: mockRandomUUID }));
