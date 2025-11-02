// Mock LoggerService to avoid file system access in tests
jest.mock('./src/services/LoggerService', () => ({
  loggerService: {
    withContext: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
      silly: jest.fn()
    })),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    silly: jest.fn()
  }
}))

// Mock React Native modules that might not be available in test environment
jest.mock('react-native/Libraries/EventEmitter/NativeEventEmitter')

// Mock expo modules that require native dependencies
jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///mock/documents/',
  cacheDirectory: 'file:///mock/cache/',
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
  moveAsync: jest.fn(),
  copyAsync: jest.fn()
}))

// Set up global test timeout
jest.setTimeout(10000)