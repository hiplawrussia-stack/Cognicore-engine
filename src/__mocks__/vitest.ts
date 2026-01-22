/**
 * VITEST SHIM FOR JEST
 * ====================
 * Provides vitest-compatible exports using Jest globals
 * This allows tests written with vitest syntax to run on Jest
 */

// Re-export Jest globals as vitest equivalents
export const describe = globalThis.describe;
export const it = globalThis.it;
export const test = globalThis.test;
export const expect = globalThis.expect;
export const beforeEach = globalThis.beforeEach;
export const afterEach = globalThis.afterEach;
export const beforeAll = globalThis.beforeAll;
export const afterAll = globalThis.afterAll;

// vi mock object compatible with vitest's vi
export const vi = {
  fn: jest.fn,
  spyOn: jest.spyOn,
  mock: jest.mock,
  unmock: jest.unmock,
  resetAllMocks: jest.resetAllMocks,
  clearAllMocks: jest.clearAllMocks,
  restoreAllMocks: jest.restoreAllMocks,

  // Timer mocks
  useFakeTimers: jest.useFakeTimers,
  useRealTimers: jest.useRealTimers,
  advanceTimersByTime: jest.advanceTimersByTime,
  runAllTimers: jest.runAllTimers,
  runOnlyPendingTimers: jest.runOnlyPendingTimers,

  // Module mocks
  doMock: jest.doMock,
  dontMock: jest.dontMock,

  // Utilities
  mocked: jest.mocked,
};

export default {
  describe,
  it,
  test,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  vi,
};
