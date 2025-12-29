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
    'SKILL_MANAGER_TRUNCATE_LINES',
    'SKILL_MANAGER_MIN_LINES',
    'SKILL_MANAGER_SAVE_OUTPUT',
    'SKILL_MANAGER_RETIREMENT_SESSIONS',
    'SKILL_MANAGER_TRACK_USAGE',
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

  it('should use default TRUNCATE_LINES of 30 when env var not set', () => {
    const config = loadConfig();
    assert.strictEqual(config.TRUNCATE_LINES, 30);
  });

  it('should override TRUNCATE_LINES from SKILL_MANAGER_TRUNCATE_LINES env var', () => {
    process.env.SKILL_MANAGER_TRUNCATE_LINES = '50';
    const config = loadConfig();
    assert.strictEqual(config.TRUNCATE_LINES, 50);
  });

  it('should use default TRUNCATE_LINES for negative values', () => {
    process.env.SKILL_MANAGER_TRUNCATE_LINES = '-10';
    const config = loadConfig();
    assert.strictEqual(config.TRUNCATE_LINES, 30, 'negative values should fall back to default');
  });

  it('should use default TRUNCATE_LINES for zero', () => {
    process.env.SKILL_MANAGER_TRUNCATE_LINES = '0';
    const config = loadConfig();
    assert.strictEqual(config.TRUNCATE_LINES, 30, 'zero should fall back to default');
  });

  it('should use default TRUNCATE_LINES for invalid values', () => {
    process.env.SKILL_MANAGER_TRUNCATE_LINES = 'not-a-number';
    const config = loadConfig();
    assert.strictEqual(config.TRUNCATE_LINES, 30, 'invalid values should fall back to default');
  });

  it('should use default MIN_LINES of 10 when env var not set', () => {
    const config = loadConfig();
    assert.strictEqual(config.MIN_LINES, 10);
  });

  it('should override MIN_LINES from SKILL_MANAGER_MIN_LINES env var', () => {
    process.env.SKILL_MANAGER_MIN_LINES = '20';
    const config = loadConfig();
    assert.strictEqual(config.MIN_LINES, 20);
  });

  it('should allow MIN_LINES of zero', () => {
    process.env.SKILL_MANAGER_MIN_LINES = '0';
    const config = loadConfig();
    assert.strictEqual(config.MIN_LINES, 0, 'zero should be allowed for MIN_LINES');
  });

  it('should use default MIN_LINES for negative values', () => {
    process.env.SKILL_MANAGER_MIN_LINES = '-5';
    const config = loadConfig();
    assert.strictEqual(config.MIN_LINES, 10, 'negative values should fall back to default');
  });

  it('should use default SAVE_OUTPUT of false when env var not set', () => {
    const config = loadConfig();
    assert.strictEqual(config.SAVE_OUTPUT, false);
  });

  it('should set SAVE_OUTPUT to true when env var is "1"', () => {
    process.env.SKILL_MANAGER_SAVE_OUTPUT = '1';
    const config = loadConfig();
    assert.strictEqual(config.SAVE_OUTPUT, true);
  });

  it('should set SAVE_OUTPUT to true when env var is "true"', () => {
    process.env.SKILL_MANAGER_SAVE_OUTPUT = 'true';
    const config = loadConfig();
    assert.strictEqual(config.SAVE_OUTPUT, true);
  });

  it('should set SAVE_OUTPUT to true when env var is "TRUE" (case-insensitive)', () => {
    process.env.SKILL_MANAGER_SAVE_OUTPUT = 'TRUE';
    const config = loadConfig();
    assert.strictEqual(config.SAVE_OUTPUT, true);
  });

  it('should set SAVE_OUTPUT to true when env var is "yes"', () => {
    process.env.SKILL_MANAGER_SAVE_OUTPUT = 'yes';
    const config = loadConfig();
    assert.strictEqual(config.SAVE_OUTPUT, true);
  });

  it('should keep SAVE_OUTPUT as false for unrecognized values', () => {
    process.env.SKILL_MANAGER_SAVE_OUTPUT = 'enabled';
    const config = loadConfig();
    assert.strictEqual(config.SAVE_OUTPUT, false);
  });

  it('should keep SAVE_OUTPUT as false for "0"', () => {
    process.env.SKILL_MANAGER_SAVE_OUTPUT = '0';
    const config = loadConfig();
    assert.strictEqual(config.SAVE_OUTPUT, false);
  });

  it('should keep SAVE_OUTPUT as false for "false"', () => {
    process.env.SKILL_MANAGER_SAVE_OUTPUT = 'false';
    const config = loadConfig();
    assert.strictEqual(config.SAVE_OUTPUT, false);
  });

  // RETIREMENT_SESSIONS tests
  it('should use default RETIREMENT_SESSIONS of 100 when env var not set', () => {
    const config = loadConfig();
    assert.strictEqual(config.RETIREMENT_SESSIONS, 100);
  });

  it('should override RETIREMENT_SESSIONS from SKILL_MANAGER_RETIREMENT_SESSIONS env var', () => {
    process.env.SKILL_MANAGER_RETIREMENT_SESSIONS = '50';
    const config = loadConfig();
    assert.strictEqual(config.RETIREMENT_SESSIONS, 50);
  });

  it('should use default RETIREMENT_SESSIONS for zero', () => {
    process.env.SKILL_MANAGER_RETIREMENT_SESSIONS = '0';
    const config = loadConfig();
    assert.strictEqual(config.RETIREMENT_SESSIONS, 100, 'zero should fall back to default');
  });

  it('should use default RETIREMENT_SESSIONS for negative values', () => {
    process.env.SKILL_MANAGER_RETIREMENT_SESSIONS = '-10';
    const config = loadConfig();
    assert.strictEqual(config.RETIREMENT_SESSIONS, 100, 'negative values should fall back to default');
  });

  it('should use default RETIREMENT_SESSIONS for invalid values', () => {
    process.env.SKILL_MANAGER_RETIREMENT_SESSIONS = 'never';
    const config = loadConfig();
    assert.strictEqual(config.RETIREMENT_SESSIONS, 100, 'invalid values should fall back to default');
  });

  // TRACK_USAGE tests
  it('should use default TRACK_USAGE of true when env var not set', () => {
    const config = loadConfig();
    assert.strictEqual(config.TRACK_USAGE, true);
  });

  it('should set TRACK_USAGE to false when env var is "0"', () => {
    process.env.SKILL_MANAGER_TRACK_USAGE = '0';
    const config = loadConfig();
    assert.strictEqual(config.TRACK_USAGE, false);
  });

  it('should set TRACK_USAGE to false when env var is "false"', () => {
    process.env.SKILL_MANAGER_TRACK_USAGE = 'false';
    const config = loadConfig();
    assert.strictEqual(config.TRACK_USAGE, false);
  });

  it('should set TRACK_USAGE to false when env var is "FALSE" (case-insensitive)', () => {
    process.env.SKILL_MANAGER_TRACK_USAGE = 'FALSE';
    const config = loadConfig();
    assert.strictEqual(config.TRACK_USAGE, false);
  });

  it('should set TRACK_USAGE to false when env var is "no"', () => {
    process.env.SKILL_MANAGER_TRACK_USAGE = 'no';
    const config = loadConfig();
    assert.strictEqual(config.TRACK_USAGE, false);
  });

  it('should keep TRACK_USAGE as true for "1"', () => {
    process.env.SKILL_MANAGER_TRACK_USAGE = '1';
    const config = loadConfig();
    assert.strictEqual(config.TRACK_USAGE, true);
  });

  it('should keep TRACK_USAGE as true for "yes"', () => {
    process.env.SKILL_MANAGER_TRACK_USAGE = 'yes';
    const config = loadConfig();
    assert.strictEqual(config.TRACK_USAGE, true);
  });

  it('should keep TRACK_USAGE as true for unrecognized values', () => {
    process.env.SKILL_MANAGER_TRACK_USAGE = 'enabled';
    const config = loadConfig();
    assert.strictEqual(config.TRACK_USAGE, true, 'unrecognized values should keep tracking enabled');
  });
});
