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
  preprocessTranscript,
  countLines,
  isSubagent,
} from '../scripts/trigger.js';

// Helper to create a temp directory
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skill-manager-error-test-'));
}

describe('error handling', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  describe('ENOENT (file not found) errors', () => {
    it('should return 0 from countLines when file does not exist', () => {
      const nonExistentFile = path.join(tempDir, 'does-not-exist.jsonl');
      const result = countLines(nonExistentFile);
      assert.strictEqual(result, 0, 'Should return 0 for missing file');
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

  describe('isSubagent edge cases', () => {
    it('should handle empty path gracefully', () => {
      assert.strictEqual(isSubagent(''), false, 'Empty path should return false');
    });

    it('should handle path with only filename', () => {
      assert.strictEqual(isSubagent('transcript.jsonl'), false);
      assert.strictEqual(isSubagent('agent-task.jsonl'), true);
    });
  });

  describe('countLines edge cases', () => {
    it('should handle file with only whitespace', () => {
      const file = path.join(tempDir, 'whitespace.jsonl');
      fs.writeFileSync(file, '   \n\n\t\t\n  \n');

      const result = countLines(file);
      assert.strictEqual(result, 0, 'Should return 0 for whitespace-only file');
    });

    it('should handle file with Windows line endings', () => {
      const file = path.join(tempDir, 'windows.jsonl');
      fs.writeFileSync(file, '{"a":1}\r\n{"b":2}\r\n');

      const result = countLines(file);
      assert.strictEqual(result, 2, 'Should handle CRLF line endings');
    });
  });

  describe('preprocessTranscript edge cases', () => {
    it('should handle empty file', () => {
      const file = path.join(tempDir, 'empty.jsonl');
      fs.writeFileSync(file, '');

      let preprocessedFile;
      try {
        preprocessedFile = preprocessTranscript(file, { truncateLines: 30 });
        const content = fs.readFileSync(preprocessedFile, 'utf8');
        assert.strictEqual(content.trim(), '', 'Should produce empty output for empty file');
      } finally {
        if (preprocessedFile && fs.existsSync(preprocessedFile)) {
          fs.unlinkSync(preprocessedFile);
        }
      }
    });

    it('should handle file with only empty lines', () => {
      const file = path.join(tempDir, 'empty-lines.jsonl');
      fs.writeFileSync(file, '\n\n\n\n');

      let preprocessedFile;
      try {
        preprocessedFile = preprocessTranscript(file, { truncateLines: 30 });
        const content = fs.readFileSync(preprocessedFile, 'utf8');
        assert.strictEqual(content.trim(), '', 'Should produce empty output for empty-lines file');
      } finally {
        if (preprocessedFile && fs.existsSync(preprocessedFile)) {
          fs.unlinkSync(preprocessedFile);
        }
      }
    });
  });
});
