/**
 * Tests for error handling
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  readStateFile,
  getMtime,
  discoverTranscripts,
  preprocessTranscript,
  main,
  releaseLock,
} from '../scripts/trigger.js';

// Default config for tests (includes all required options)
const defaultTestConfig = {
  TRANSCRIPT_COUNT: 1,
  LOOKBACK_DAYS: 7,
  TRUNCATE_LINES: 30,
  SKIP_SUBAGENTS: true,
  DISCOVERY_LIMIT: 1000,
  MIN_FILE_SIZE: 500,
};

// Default discovery config for discoverTranscripts calls
const defaultDiscoveryConfig = {
  lookbackDays: 7,
  skipSubagents: false,
  minFileSize: 0,
  discoveryLimit: 1000,
};

// Helper to create a JSONL file with enough content to pass filters
function createTestTranscript(dir, entries = []) {
  const filename = `test-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`;
  const filePath = path.join(dir, filename);

  // Pad entries to meet minimum file size (600 bytes)
  const paddedEntries = [...entries];
  let content = paddedEntries.map(e => JSON.stringify(e)).join('\n');
  let index = paddedEntries.length;
  while (content.length < 600) {
    const paddingEntry = JSON.stringify({ type: 'padding', index: index++, data: 'x'.repeat(50) });
    content += '\n' + paddingEntry;
  }

  fs.writeFileSync(filePath, content);
  return filePath;
}

describe('error handling', () => {
  let tempDir;
  let stateDir;
  let projectsDir;

  beforeEach(() => {
    // Create a unique temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-manager-error-test-'));
    stateDir = path.join(tempDir, 'state');
    projectsDir = path.join(tempDir, 'projects');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.mkdirSync(projectsDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  describe('ENOENT (file not found) errors', () => {
    it('should return null from readStateFile when file does not exist', () => {
      const nonExistentFile = path.join(tempDir, 'does-not-exist.json');

      const result = readStateFile(nonExistentFile);

      assert.strictEqual(result, null, 'Should return null for missing file');
    });

    it('should return null from getMtime when file does not exist', () => {
      const nonExistentFile = path.join(tempDir, 'does-not-exist.txt');

      const result = getMtime(nonExistentFile);

      assert.strictEqual(result, null, 'Should return null for missing file');
    });

    it('should return empty array from discoverTranscripts when directory does not exist', () => {
      const nonExistentDir = path.join(tempDir, 'non-existent-projects');

      const result = discoverTranscripts(nonExistentDir, defaultDiscoveryConfig);

      assert.deepStrictEqual(result, [], 'Should return empty array for missing directory');
    });

    it('should skip missing transcript files in processTranscript without crashing', async () => {
      // Setup: create state file but no transcript
      const stateFile = path.join(stateDir, 'analyzed.json');
      fs.writeFileSync(stateFile, JSON.stringify({ version: 1, transcripts: {} }));

      const logs = [];
      const logFn = (msg) => logs.push(msg);

      // Create a transcript path that doesn't exist
      const missingTranscriptPath = path.join(projectsDir, 'missing.jsonl');

      // Import processTranscript dynamically
      const { processTranscript } = await import('../scripts/trigger.js');

      const result = await processTranscript({
        transcriptPath: missingTranscriptPath,
        state: { version: 1, transcripts: {} },
        stateFile,
        log: logFn,
        runAnalysis: async () => ({ exitCode: 0 }),
        config: { TRUNCATE_LINES: 30 },
      });

      assert.strictEqual(result.skipped, true, 'Should mark as skipped');
      assert.strictEqual(result.reason, 'file_missing', 'Should indicate file_missing reason');
    });
  });

  describe('EACCES (permission) errors', () => {
    it('should throw EACCES when reading file without permission', function () {
      // Skip on Windows as permission model is different
      if (process.platform === 'win32') {
        this.skip();
        return;
      }

      // Create a file and remove read permissions
      const restrictedFile = path.join(tempDir, 'no-read.json');
      fs.writeFileSync(restrictedFile, '{"version":1}');
      fs.chmodSync(restrictedFile, 0o000);

      try {
        assert.throws(
          () => readStateFile(restrictedFile),
          { code: 'EACCES' },
          'Should throw EACCES error for permission denied'
        );
      } finally {
        // Restore permissions for cleanup
        fs.chmodSync(restrictedFile, 0o644);
      }
    });

    it('should throw EACCES when writing to directory without permission', async function () {
      // Skip on Windows as permission model is different
      if (process.platform === 'win32') {
        this.skip();
        return;
      }

      // Create a directory and remove write permissions
      const restrictedDir = path.join(tempDir, 'no-write');
      fs.mkdirSync(restrictedDir);
      fs.chmodSync(restrictedDir, 0o444);

      try {
        const { writeStateFile } = await import('../scripts/trigger.js');

        assert.throws(
          () => writeStateFile(path.join(restrictedDir, 'state.json'), { version: 1, transcripts: {} }),
          { code: 'EACCES' },
          'Should throw EACCES error for permission denied'
        );
      } finally {
        // Restore permissions for cleanup
        fs.chmodSync(restrictedDir, 0o755);
      }
    });
  });

  describe('JSON parse errors in state file', () => {
    it('should throw SyntaxError from readStateFile for invalid JSON', () => {
      const stateFile = path.join(stateDir, 'analyzed.json');
      fs.writeFileSync(stateFile, 'not valid json {{{');

      assert.throws(
        () => readStateFile(stateFile),
        SyntaxError,
        'Should throw SyntaxError for invalid JSON'
      );
    });

    it('should recover from corrupted state file in main by reinitializing', async () => {
      // Create corrupted state file
      const stateFile = path.join(stateDir, 'analyzed.json');
      fs.writeFileSync(stateFile, 'corrupted {{{ json');

      // Create a transcript to process (with enough lines to pass filter)
      const transcriptDir = path.join(projectsDir, 'project1');
      fs.mkdirSync(transcriptDir, { recursive: true });
      createTestTranscript(transcriptDir, [{ type: 'summary', message: { content: 'test' } }]);

      const logs = [];
      const logFn = (msg) => logs.push(msg);

      // main() should recover by calling initStateFile
      const exitCode = await main({
        stateDir,
        projectsDir,
        log: logFn,
        runAnalysis: async () => ({ exitCode: 0 }),
        config: defaultTestConfig,
      });

      // Should have recovered and processed successfully
      assert.strictEqual(exitCode, 0, 'Should exit successfully after recovery');

      // State file should now be valid JSON
      const stateContent = fs.readFileSync(stateFile, 'utf8');
      assert.doesNotThrow(() => JSON.parse(stateContent), 'State file should be valid JSON');
    });
  });

  describe('JSON parse errors in transcript', () => {
    it('should skip malformed JSON lines in preprocessTranscript', () => {
      // Create transcript with mixed valid and invalid JSON lines
      const transcriptFile = path.join(tempDir, 'malformed.jsonl');
      const content = [
        '{"type":"summary","message":{"content":"valid line 1"}}',
        'not valid json at all',
        '{"type":"user","message":{"content":"valid line 2"}}',
        '{incomplete json',
        '{"type":"assistant","message":{"content":"valid line 3"}}',
      ].join('\n');
      fs.writeFileSync(transcriptFile, content);

      // Should not throw, should skip invalid lines
      let preprocessedFile;
      try {
        preprocessedFile = preprocessTranscript(transcriptFile, { truncateLines: 30 });

        const preprocessedContent = fs.readFileSync(preprocessedFile, 'utf8');
        const lines = preprocessedContent.split('\n').filter(l => l.trim());

        // Should have 3 valid lines (the malformed ones are skipped)
        assert.strictEqual(lines.length, 3, 'Should have 3 valid lines after skipping malformed');

        // Each remaining line should be valid JSON
        for (const line of lines) {
          assert.doesNotThrow(() => JSON.parse(line), `Line should be valid JSON: ${line}`);
        }
      } finally {
        // Clean up temp file
        if (preprocessedFile && fs.existsSync(preprocessedFile)) {
          fs.unlinkSync(preprocessedFile);
        }
      }
    });

    it('should handle completely malformed transcript file gracefully', () => {
      const transcriptFile = path.join(tempDir, 'all-malformed.jsonl');
      fs.writeFileSync(transcriptFile, 'not json\nalso not json\nstill not json');

      let preprocessedFile;
      try {
        preprocessedFile = preprocessTranscript(transcriptFile, { truncateLines: 30 });

        const preprocessedContent = fs.readFileSync(preprocessedFile, 'utf8');

        // Should be empty (all lines skipped)
        assert.strictEqual(preprocessedContent.trim(), '', 'Should produce empty output for all-malformed input');
      } finally {
        if (preprocessedFile && fs.existsSync(preprocessedFile)) {
          fs.unlinkSync(preprocessedFile);
        }
      }
    });
  });

  describe('unexpected errors and crash prevention', () => {
    it('should release lock even when runAnalysis throws', async () => {
      // Create valid transcript (with enough lines to pass filter)
      const transcriptDir = path.join(projectsDir, 'project1');
      fs.mkdirSync(transcriptDir, { recursive: true });
      createTestTranscript(transcriptDir, [{ type: 'summary', message: { content: 'test' } }]);

      const logs = [];
      const logFn = (msg) => logs.push(msg);

      // runAnalysis that throws
      const throwingAnalysis = async () => {
        throw new Error('Simulated analysis failure');
      };

      // main() should throw but release lock first
      await assert.rejects(
        async () => main({
          stateDir,
          projectsDir,
          log: logFn,
          runAnalysis: throwingAnalysis,
          config: defaultTestConfig,
        }),
        { message: 'Simulated analysis failure' },
        'Should propagate the error'
      );

      // Lock should be released (lock directory should not exist)
      const lockDir = path.join(stateDir, 'skill-manager.lock.d');
      assert.strictEqual(
        fs.existsSync(lockDir),
        false,
        'Lock should be released even after error'
      );
    });

    it('should continue processing remaining transcripts after one fails with non-zero exit', async () => {
      // Create two transcripts (with enough lines to pass filter)
      const transcriptDir = path.join(projectsDir, 'project1');
      fs.mkdirSync(transcriptDir, { recursive: true });
      createTestTranscript(transcriptDir, [{ type: 'summary', message: { content: 'test1' } }]);
      createTestTranscript(transcriptDir, [{ type: 'summary', message: { content: 'test2' } }]);

      const logs = [];
      const logFn = (msg) => logs.push(msg);

      let callCount = 0;
      // First call fails, second succeeds
      const mixedAnalysis = async () => {
        callCount++;
        return { exitCode: callCount === 1 ? 1 : 0 };
      };

      const exitCode = await main({
        stateDir,
        projectsDir,
        log: logFn,
        runAnalysis: mixedAnalysis,
        config: { ...defaultTestConfig, TRANSCRIPT_COUNT: 2 },
      });

      // Should process both transcripts
      assert.strictEqual(callCount, 2, 'Should call runAnalysis for both transcripts');
      assert.strictEqual(exitCode, 0, 'Should exit successfully even with failed transcript');
    });
  });

  describe('error logging', () => {
    it('should log when a transcript fails with non-zero exit code', async () => {
      // Create a transcript (with enough lines to pass filter)
      const transcriptDir = path.join(projectsDir, 'project1');
      fs.mkdirSync(transcriptDir, { recursive: true });
      createTestTranscript(transcriptDir, [{ type: 'summary', message: { content: 'test' } }]);

      const logs = [];
      const logFn = (msg) => logs.push(msg);

      const failingAnalysis = async () => ({ exitCode: 42 });

      await main({
        stateDir,
        projectsDir,
        log: logFn,
        runAnalysis: failingAnalysis,
        config: defaultTestConfig,
      });

      // Should have logged the failure
      const failureLog = logs.find(l => l.includes('Failed') && l.includes('exit'));
      assert.ok(failureLog, 'Should log failure with exit code');
      assert.ok(failureLog.includes('42'), 'Should include exit code in log message');
    });

    it('should log when skipping a missing transcript file', async () => {
      // Setup state with a non-existent transcript marked for processing
      const stateFile = path.join(stateDir, 'analyzed.json');
      fs.writeFileSync(stateFile, JSON.stringify({ version: 1, transcripts: {} }));

      const logs = [];
      const logFn = (msg) => logs.push(msg);

      const { processTranscript } = await import('../scripts/trigger.js');

      await processTranscript({
        transcriptPath: '/non/existent/path.jsonl',
        state: { version: 1, transcripts: {} },
        stateFile,
        log: logFn,
        runAnalysis: async () => ({ exitCode: 0 }),
        config: { TRUNCATE_LINES: 30 },
      });

      const skipLog = logs.find(l => l.includes('Skipped') && l.includes('missing'));
      assert.ok(skipLog, 'Should log when skipping missing file');
    });
  });
});
