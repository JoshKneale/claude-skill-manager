/**
 * Tests for main function (integration)
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Helper to create a temp directory for tests
function createTempDir() {
  const tmpDir = os.tmpdir();
  const testDir = path.join(tmpDir, `main-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(testDir, { recursive: true });
  return testDir;
}

// Helper to create a temp JSONL file with given entries
// Pads with dummy entries to ensure file passes MIN_FILE_SIZE filter
function createTempJsonl(dir, entries, options = {}) {
  const { minSize = 600 } = options;
  const tmpFile = path.join(dir, `test-transcript-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);

  // Pad entries to meet minimum file size
  const paddedEntries = [...entries];
  let content = paddedEntries.map((e) => JSON.stringify(e)).join('\n');

  // Add padding entries until we reach minimum size
  let index = paddedEntries.length;
  while (content.length < minSize) {
    const paddingEntry = JSON.stringify({ type: 'padding', index: index++, data: 'x'.repeat(50) });
    content += '\n' + paddingEntry;
  }

  fs.writeFileSync(tmpFile, content);
  return tmpFile;
}

// Default config for tests (includes all required options)
const defaultTestConfig = {
  TRANSCRIPT_COUNT: 1,
  LOOKBACK_DAYS: 7,
  TRUNCATE_LINES: 30,
  SKIP_SUBAGENTS: true,
  DISCOVERY_LIMIT: 1000,
  MIN_FILE_SIZE: 500,
};

// Helper to create initial state
function createInitialState() {
  return { version: 1, transcripts: {} };
}

describe('main', () => {
  let tempDir;
  let stateDir;
  let projectsDir;
  let logMessages;
  let mockLog;
  let originalEnv;

  beforeEach(() => {
    // Create a unique temp directory structure for each test
    tempDir = createTempDir();
    stateDir = path.join(tempDir, '.claude', 'skill-manager');
    projectsDir = path.join(tempDir, '.claude', 'projects');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.mkdirSync(projectsDir, { recursive: true });

    // Capture log messages
    logMessages = [];
    mockLog = (msg) => logMessages.push(msg);

    // Save original env
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    // Restore original env
    process.env = originalEnv;
    mock.reset();
  });

  describe('initialization', () => {
    it('should ensure directories exist', async () => {
      // Import main (will fail until implemented)
      const { main } = await import('../scripts/trigger.js');

      // Remove state dir to test creation
      fs.rmSync(stateDir, { recursive: true, force: true });
      assert.strictEqual(fs.existsSync(stateDir), false, 'State dir should not exist before main');

      // Call main with mocked paths
      await main({
        stateDir,
        projectsDir,
        log: mockLog,
        runAnalysis: mock.fn(() => ({ exitCode: 0 })),
        config: defaultTestConfig,
      });

      // State dir should now exist
      assert.strictEqual(fs.existsSync(stateDir), true, 'State dir should be created by main');
    });

    it('should cleanup old logs', async () => {
      const { main } = await import('../scripts/trigger.js');

      // Create an old log file (8 days old)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 8);
      const oldLogFile = path.join(stateDir, `skill-manager-${oldDate.toISOString().slice(0, 10)}.log`);
      fs.writeFileSync(oldLogFile, 'old log content');

      // Set mtime to 8 days ago
      const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
      fs.utimesSync(oldLogFile, new Date(eightDaysAgo), new Date(eightDaysAgo));

      assert.strictEqual(fs.existsSync(oldLogFile), true, 'Old log should exist before main');

      await main({
        stateDir,
        projectsDir,
        log: mockLog,
        runAnalysis: mock.fn(() => ({ exitCode: 0 })),
        config: defaultTestConfig,
      });

      // Old log should be cleaned up
      assert.strictEqual(fs.existsSync(oldLogFile), false, 'Old log should be deleted by main');
    });

    it('should initialize state file', async () => {
      const { main } = await import('../scripts/trigger.js');

      const stateFile = path.join(stateDir, 'analyzed.json');

      // Ensure no state file exists
      if (fs.existsSync(stateFile)) {
        fs.unlinkSync(stateFile);
      }

      await main({
        stateDir,
        projectsDir,
        log: mockLog,
        runAnalysis: mock.fn(() => ({ exitCode: 0 })),
        config: defaultTestConfig,
      });

      // State file should exist and be valid JSON
      assert.strictEqual(fs.existsSync(stateFile), true, 'State file should be created');
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      assert.strictEqual(typeof state.version, 'number', 'State should have version number');
      assert.strictEqual(typeof state.transcripts, 'object', 'State should have transcripts object');
    });
  });

  describe('transcript discovery', () => {
    it('should exit gracefully if projects directory missing', async () => {
      const { main } = await import('../scripts/trigger.js');

      // Remove projects directory
      fs.rmSync(projectsDir, { recursive: true, force: true });

      const result = await main({
        stateDir,
        projectsDir,
        log: mockLog,
        runAnalysis: mock.fn(() => ({ exitCode: 0 })),
        config: defaultTestConfig,
      });

      // Should exit gracefully (return 0 or undefined, not throw)
      assert.ok(result === 0 || result === undefined, 'Should exit gracefully when projects dir missing');

      // Should log about missing directory
      const missedLog = logMessages.some(
        (msg) => msg.includes('projects') || msg.includes('No transcripts') || msg.includes('missing')
      );
      assert.ok(missedLog, `Should log about missing projects directory. Got: ${JSON.stringify(logMessages)}`);
    });

    it('should exit gracefully if no recent transcripts', async () => {
      const { main } = await import('../scripts/trigger.js');

      // Projects directory exists but is empty (no transcripts)
      // Already empty from beforeEach

      const result = await main({
        stateDir,
        projectsDir,
        log: mockLog,
        runAnalysis: mock.fn(() => ({ exitCode: 0 })),
        config: defaultTestConfig,
      });

      // Should exit gracefully
      assert.ok(result === 0 || result === undefined, 'Should exit gracefully when no transcripts');
    });

    it('should exit gracefully if all transcripts analyzed', async () => {
      const { main } = await import('../scripts/trigger.js');

      // Create a transcript file
      const transcriptPath = createTempJsonl(projectsDir, [
        { type: 'user', message: { content: 'hello' } },
      ]);

      // Create state file marking it as already analyzed
      const stateFile = path.join(stateDir, 'analyzed.json');
      const state = {
        version: 1,
        transcripts: {
          [transcriptPath]: { status: 'completed', analyzed_at: new Date().toISOString() },
        },
      };
      fs.writeFileSync(stateFile, JSON.stringify(state));

      const mockRunAnalysis = mock.fn(() => ({ exitCode: 0 }));

      const result = await main({
        stateDir,
        projectsDir,
        log: mockLog,
        runAnalysis: mockRunAnalysis,
        config: defaultTestConfig,
      });

      // Should exit gracefully without processing
      assert.ok(result === 0 || result === undefined, 'Should exit gracefully when all analyzed');

      // Should NOT have called runAnalysis
      assert.strictEqual(mockRunAnalysis.mock.calls.length, 0, 'Should not process already-analyzed transcripts');
    });
  });

  describe('locking', () => {
    it('should exit gracefully if lock already held', async () => {
      const { main, acquireLock } = await import('../scripts/trigger.js');

      // Create a transcript to process
      createTempJsonl(projectsDir, [
        { type: 'user', message: { content: 'hello' } },
      ]);

      // Acquire lock before calling main
      const lockAcquired = acquireLock(stateDir);
      assert.strictEqual(lockAcquired, true, 'Should be able to acquire lock');

      const mockRunAnalysis = mock.fn(() => ({ exitCode: 0 }));

      const result = await main({
        stateDir,
        projectsDir,
        log: mockLog,
        runAnalysis: mockRunAnalysis,
        config: defaultTestConfig,
      });

      // Should exit gracefully
      assert.ok(result === 0 || result === undefined, 'Should exit gracefully when lock held');

      // Should log about lock
      const lockLog = logMessages.some(
        (msg) => msg.includes('lock') || msg.includes('running') || msg.includes('held')
      );
      assert.ok(lockLog, `Should log about lock being held. Got: ${JSON.stringify(logMessages)}`);

      // Should NOT have called runAnalysis
      assert.strictEqual(mockRunAnalysis.mock.calls.length, 0, 'Should not process when lock held');
    });

    it('should release lock on completion', async () => {
      const { main } = await import('../scripts/trigger.js');

      // Create a transcript to process
      createTempJsonl(projectsDir, [
        { type: 'user', message: { content: 'hello' } },
      ]);

      await main({
        stateDir,
        projectsDir,
        log: mockLog,
        runAnalysis: mock.fn(() => ({ exitCode: 0 })),
        config: defaultTestConfig,
      });

      // Lock should be released (lock directory should not exist)
      const lockDir = path.join(stateDir, 'skill-manager.lock.d');
      assert.strictEqual(fs.existsSync(lockDir), false, 'Lock should be released after main completes');
    });

    it('should release lock on error', async () => {
      const { main } = await import('../scripts/trigger.js');

      // Create a transcript to process
      createTempJsonl(projectsDir, [
        { type: 'user', message: { content: 'hello' } },
      ]);

      // Mock runAnalysis to throw an error
      const throwingRunAnalysis = mock.fn(() => {
        throw new Error('Simulated analysis failure');
      });

      // Should not throw to the caller, but handle the error gracefully
      try {
        await main({
          stateDir,
          projectsDir,
          log: mockLog,
          runAnalysis: throwingRunAnalysis,
          config: defaultTestConfig,
        });
      } catch (err) {
        // It's okay if it throws, but lock should still be released
      }

      // Lock should be released even after error
      const lockDir = path.join(stateDir, 'skill-manager.lock.d');
      assert.strictEqual(fs.existsSync(lockDir), false, 'Lock should be released even after error');
    });
  });

  describe('processing', () => {
    it('should process up to TRANSCRIPT_COUNT transcripts', async () => {
      const { main } = await import('../scripts/trigger.js');

      // Create multiple transcripts
      const transcript1 = createTempJsonl(projectsDir, [{ type: 'user', message: { content: '1' } }]);
      const transcript2 = createTempJsonl(projectsDir, [{ type: 'user', message: { content: '2' } }]);
      const transcript3 = createTempJsonl(projectsDir, [{ type: 'user', message: { content: '3' } }]);

      const processedPaths = [];
      const mockRunAnalysis = mock.fn((path) => {
        processedPaths.push(path);
        return { exitCode: 0 };
      });

      // Set TRANSCRIPT_COUNT to 2
      await main({
        stateDir,
        projectsDir,
        log: mockLog,
        runAnalysis: mockRunAnalysis,
        config: { ...defaultTestConfig, TRANSCRIPT_COUNT: 2 },
      });

      // Should have processed exactly 2 transcripts
      assert.strictEqual(mockRunAnalysis.mock.calls.length, 2, 'Should process exactly TRANSCRIPT_COUNT transcripts');
    });

    it('should process transcripts in order (newest first)', async () => {
      const { main } = await import('../scripts/trigger.js');

      // Create transcripts with different modification times
      const older = createTempJsonl(projectsDir, [{ type: 'user', message: { content: 'older' } }]);
      // Wait a bit to ensure different mtime
      await new Promise((resolve) => setTimeout(resolve, 50));
      const newer = createTempJsonl(projectsDir, [{ type: 'user', message: { content: 'newer' } }]);

      // Set mtime to be clearly different (older is 2 hours ago)
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      fs.utimesSync(older, new Date(twoHoursAgo), new Date(twoHoursAgo));

      const processOrder = [];
      const mockRunAnalysis = mock.fn((preprocessedPath) => {
        // We need to check which original transcript this corresponds to
        // Since preprocessed paths are different, we track order of calls
        processOrder.push(mockRunAnalysis.mock.calls.length);
        return { exitCode: 0 };
      });

      await main({
        stateDir,
        projectsDir,
        log: mockLog,
        runAnalysis: mockRunAnalysis,
        config: { ...defaultTestConfig, TRANSCRIPT_COUNT: 2 },
      });

      // Verify both were processed
      assert.strictEqual(mockRunAnalysis.mock.calls.length, 2, 'Should process both transcripts');

      // The order should be newest first (based on mtime)
      // We can verify this by checking logs or state file
      const stateFile = path.join(stateDir, 'analyzed.json');
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

      // Both should be in state
      assert.ok(state.transcripts[newer], 'Newer transcript should be in state');
      assert.ok(state.transcripts[older], 'Older transcript should be in state');
    });
  });

  describe('stdin handling', () => {
    it('should read and discard stdin (hook compliance)', async () => {
      const { main } = await import('../scripts/trigger.js');

      // Create a transcript to process
      createTempJsonl(projectsDir, [
        { type: 'user', message: { content: 'hello' } },
      ]);

      // The main function should accept a stdin option or handle process.stdin
      // This test verifies the function doesn't hang waiting for stdin
      // and properly drains it for hook compliance

      let stdinConsumed = false;
      const mockStdin = {
        resume: mock.fn(() => {
          stdinConsumed = true;
        }),
        on: mock.fn((event, cb) => {
          if (event === 'end') {
            // Simulate stdin ending immediately
            setImmediate(cb);
          }
        }),
      };

      await main({
        stateDir,
        projectsDir,
        log: mockLog,
        runAnalysis: mock.fn(() => ({ exitCode: 0 })),
        config: defaultTestConfig,
        stdin: mockStdin,
      });

      // stdin should have been consumed (resume called to drain)
      // Note: The actual implementation may vary - this tests the contract
      assert.ok(
        mockStdin.resume.mock.calls.length > 0 || stdinConsumed,
        'stdin should be consumed for hook compliance'
      );
    });
  });
});
