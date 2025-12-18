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
  const envKeys = [
    'SKILL_MANAGER_COUNT',
    'SKILL_MANAGER_LOOKBACK_DAYS',
    'SKILL_MANAGER_TRUNCATE_LINES',
    'SKILL_MANAGER_SKIP_SUBAGENTS',
    'SKILL_MANAGER_DISCOVERY_LIMIT',
    'SKILL_MANAGER_MIN_FILE_SIZE',
  ];

  beforeEach(() => {
    originalEnv = {};
    for (const key of envKeys) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    // Restore original env vars
    for (const key of envKeys) {
      if (originalEnv[key] !== undefined) {
        process.env[key] = originalEnv[key];
      } else {
        delete process.env[key];
      }
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

  it('should use default SKIP_SUBAGENTS of true when env var not set', () => {
    const config = loadConfig();
    assert.strictEqual(config.SKIP_SUBAGENTS, true);
  });

  it('should set SKIP_SUBAGENTS to false when env var is "0"', () => {
    process.env.SKILL_MANAGER_SKIP_SUBAGENTS = '0';
    const config = loadConfig();
    assert.strictEqual(config.SKIP_SUBAGENTS, false);
  });

  it('should use default DISCOVERY_LIMIT of 1000 when env var not set', () => {
    const config = loadConfig();
    assert.strictEqual(config.DISCOVERY_LIMIT, 1000);
  });

  it('should override DISCOVERY_LIMIT from env var', () => {
    process.env.SKILL_MANAGER_DISCOVERY_LIMIT = '500';
    const config = loadConfig();
    assert.strictEqual(config.DISCOVERY_LIMIT, 500);
  });

  it('should use default MIN_FILE_SIZE of 500 when env var not set', () => {
    const config = loadConfig();
    assert.strictEqual(config.MIN_FILE_SIZE, 500);
  });

  it('should override MIN_FILE_SIZE from env var', () => {
    process.env.SKILL_MANAGER_MIN_FILE_SIZE = '1000';
    const config = loadConfig();
    assert.strictEqual(config.MIN_FILE_SIZE, 1000);
  });
});
