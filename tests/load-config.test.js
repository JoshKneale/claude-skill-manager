/**
 * Tests for loadConfig function
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

import { loadConfig } from '../scripts/trigger.js';

describe('loadConfig', () => {
  // Store original env vars to restore after each test
  let originalEnv;

  beforeEach(() => {
    originalEnv = {
      SKILL_MANAGER_COUNT: process.env.SKILL_MANAGER_COUNT,
      SKILL_MANAGER_LOOKBACK_DAYS: process.env.SKILL_MANAGER_LOOKBACK_DAYS,
      SKILL_MANAGER_TRUNCATE_LINES: process.env.SKILL_MANAGER_TRUNCATE_LINES,
    };
    // Clear env vars before each test
    delete process.env.SKILL_MANAGER_COUNT;
    delete process.env.SKILL_MANAGER_LOOKBACK_DAYS;
    delete process.env.SKILL_MANAGER_TRUNCATE_LINES;
  });

  afterEach(() => {
    // Restore original env vars
    if (originalEnv.SKILL_MANAGER_COUNT !== undefined) {
      process.env.SKILL_MANAGER_COUNT = originalEnv.SKILL_MANAGER_COUNT;
    } else {
      delete process.env.SKILL_MANAGER_COUNT;
    }
    if (originalEnv.SKILL_MANAGER_LOOKBACK_DAYS !== undefined) {
      process.env.SKILL_MANAGER_LOOKBACK_DAYS = originalEnv.SKILL_MANAGER_LOOKBACK_DAYS;
    } else {
      delete process.env.SKILL_MANAGER_LOOKBACK_DAYS;
    }
    if (originalEnv.SKILL_MANAGER_TRUNCATE_LINES !== undefined) {
      process.env.SKILL_MANAGER_TRUNCATE_LINES = originalEnv.SKILL_MANAGER_TRUNCATE_LINES;
    } else {
      delete process.env.SKILL_MANAGER_TRUNCATE_LINES;
    }
  });

  it('should use default TRANSCRIPT_COUNT of 1 when env var not set', () => {
    const config = loadConfig();
    assert.strictEqual(config.TRANSCRIPT_COUNT, 1);
  });

  it('should use default LOOKBACK_DAYS of 7 when env var not set', () => {
    const config = loadConfig();
    assert.strictEqual(config.LOOKBACK_DAYS, 7);
  });

  it('should use default TRUNCATE_LINES of 30 when env var not set', () => {
    const config = loadConfig();
    assert.strictEqual(config.TRUNCATE_LINES, 30);
  });

  it('should override TRANSCRIPT_COUNT from SKILL_MANAGER_COUNT env var', () => {
    process.env.SKILL_MANAGER_COUNT = '5';
    const config = loadConfig();
    assert.strictEqual(config.TRANSCRIPT_COUNT, 5);
  });

  it('should override LOOKBACK_DAYS from SKILL_MANAGER_LOOKBACK_DAYS env var', () => {
    process.env.SKILL_MANAGER_LOOKBACK_DAYS = '14';
    const config = loadConfig();
    assert.strictEqual(config.LOOKBACK_DAYS, 14);
  });

  it('should override TRUNCATE_LINES from SKILL_MANAGER_TRUNCATE_LINES env var', () => {
    process.env.SKILL_MANAGER_TRUNCATE_LINES = '50';
    const config = loadConfig();
    assert.strictEqual(config.TRUNCATE_LINES, 50);
  });
});
