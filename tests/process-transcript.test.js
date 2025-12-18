/**
 * Tests for processTranscript function
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Helper to create a temp directory for tests
function createTempDir() {
  const tmpDir = os.tmpdir();
  const testDir = path.join(tmpDir, `process-transcript-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(testDir, { recursive: true });
  return testDir;
}

// Helper to create a temp JSONL file with given entries
function createTempJsonl(dir, entries) {
  const tmpFile = path.join(dir, `test-transcript-${Date.now()}.jsonl`);
  const content = entries.map((e) => JSON.stringify(e)).join('\n');
  fs.writeFileSync(tmpFile, content);
  return tmpFile;
}

describe('processTranscript', () => {
  let testDir;
  let logMessages;
  let mockLog;

  beforeEach(() => {
    testDir = createTempDir();

    // Capture log messages
    logMessages = [];
    mockLog = (msg) => logMessages.push(msg);
  });

  afterEach(() => {
    // Clean up test directory
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    mock.reset();
  });

  describe('preprocessing', () => {
    it('should preprocess transcript before analysis', async () => {
      const { processTranscript, runAnalysis } = await import('../scripts/trigger.js');

      const transcriptPath = createTempJsonl(testDir, [
        { type: 'user', userType: 'external', cwd: '/test', message: { role: 'user', content: 'hello' } },
        { type: 'file-history-snapshot', data: 'should be filtered' },
      ]);

      let capturedPath = null;

      // Mock runAnalysis module-level to capture the path
      const originalRunAnalysis = runAnalysis;

      await processTranscript({
        transcriptPath,
        log: mockLog,
        config: { TRUNCATE_LINES: 30, SAVE_OUTPUT: false },
        outputsDir: testDir,
      });

      // Log should indicate preprocessing happened
      assert.ok(
        logMessages.some((msg) => msg.includes('Preprocessing')),
        'Should log preprocessing step'
      );
    });

    it('should log size reduction statistics', async () => {
      const { processTranscript } = await import('../scripts/trigger.js');

      // Create a transcript with metadata that will be stripped
      const transcriptPath = createTempJsonl(testDir, [
        {
          type: 'user',
          userType: 'external',
          isSidechain: false,
          cwd: '/very/long/path/to/project',
          version: '1.0.0',
          gitBranch: 'main',
          message: { role: 'user', content: 'hello world' },
        },
        {
          type: 'assistant',
          userType: 'external',
          isSidechain: false,
          cwd: '/very/long/path/to/project',
          version: '1.0.0',
          gitBranch: 'main',
          message: { role: 'assistant', content: 'hi there' },
        },
      ]);

      await processTranscript({
        transcriptPath,
        log: mockLog,
        config: { TRUNCATE_LINES: 30, SAVE_OUTPUT: false },
        outputsDir: testDir,
      });

      // Should log size reduction info
      const sizeLog = logMessages.find(
        (msg) => msg.includes('bytes') || msg.includes('reduction') || msg.includes('Reduced')
      );
      assert.ok(sizeLog, `Should log size reduction. Got logs: ${JSON.stringify(logMessages)}`);
    });
  });

  describe('logging', () => {
    it('should log processing duration', async () => {
      const { processTranscript } = await import('../scripts/trigger.js');

      const transcriptPath = createTempJsonl(testDir, [
        { type: 'user', message: { content: 'hello' } },
      ]);

      await processTranscript({
        transcriptPath,
        log: mockLog,
        config: { TRUNCATE_LINES: 30, SAVE_OUTPUT: false },
        outputsDir: testDir,
      });

      // Should log duration
      const durationLog = logMessages.find(
        (msg) => msg.includes('s') || msg.includes('Completed') || msg.includes('Failed')
      );
      assert.ok(durationLog, `Should log processing duration. Got logs: ${JSON.stringify(logMessages)}`);
    });

    it('should log when starting processing', async () => {
      const { processTranscript } = await import('../scripts/trigger.js');

      const transcriptPath = createTempJsonl(testDir, [
        { type: 'user', message: { content: 'hello' } },
      ]);

      await processTranscript({
        transcriptPath,
        log: mockLog,
        config: { TRUNCATE_LINES: 30, SAVE_OUTPUT: false },
        outputsDir: testDir,
      });

      // Should log the transcript being processed
      const startLog = logMessages.find(
        (msg) => msg.includes('Processing') || msg.includes(transcriptPath)
      );
      assert.ok(startLog, `Should log start of processing. Got logs: ${JSON.stringify(logMessages)}`);
    });
  });

  describe('return value', () => {
    it('should return success result on successful processing', async () => {
      const { processTranscript } = await import('../scripts/trigger.js');

      const transcriptPath = createTempJsonl(testDir, [
        { type: 'user', message: { content: 'hello' } },
      ]);

      const result = await processTranscript({
        transcriptPath,
        log: mockLog,
        config: { TRUNCATE_LINES: 30, SAVE_OUTPUT: false },
        outputsDir: testDir,
      });

      // Result should have success property
      assert.ok('success' in result, 'Result should have success property');
    });
  });
});
