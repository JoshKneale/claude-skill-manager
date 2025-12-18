/**
 * Tests for preprocessTranscript function
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { preprocessTranscript } from '../scripts/trigger.js';

// Helper to create a temp JSONL file with given entries
function createTempJsonl(entries) {
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `test-transcript-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
  const content = entries.map((e) => JSON.stringify(e)).join('\n');
  fs.writeFileSync(tmpFile, content);
  return tmpFile;
}

// Helper to read and parse the output JSONL file
function readJsonl(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.trim()) return [];
  return content
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
}

describe('preprocessTranscript', () => {
  let inputFile;
  let outputFile;

  afterEach(() => {
    // Clean up temp files
    if (inputFile && fs.existsSync(inputFile)) {
      fs.unlinkSync(inputFile);
    }
    if (outputFile && fs.existsSync(outputFile)) {
      fs.unlinkSync(outputFile);
    }
  });

  describe('filtering message types', () => {
    it('should remove file-history-snapshot entries', () => {
      inputFile = createTempJsonl([
        { type: 'file-history-snapshot', data: 'some-snapshot-data' },
        { type: 'user', message: { content: 'hello' } },
      ]);

      outputFile = preprocessTranscript(inputFile, { truncateLines: 30 });
      const result = readJsonl(outputFile);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].type, 'user');
    });

    it('should remove queue-operation entries', () => {
      inputFile = createTempJsonl([
        { type: 'queue-operation', operation: 'enqueue' },
        { type: 'assistant', message: { content: 'response' } },
      ]);

      outputFile = preprocessTranscript(inputFile, { truncateLines: 30 });
      const result = readJsonl(outputFile);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].type, 'assistant');
    });

    it('should keep user message entries', () => {
      inputFile = createTempJsonl([
        { type: 'user', message: { content: 'hello world' } },
      ]);

      outputFile = preprocessTranscript(inputFile, { truncateLines: 30 });
      const result = readJsonl(outputFile);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].type, 'user');
    });

    it('should keep assistant message entries', () => {
      inputFile = createTempJsonl([
        { type: 'assistant', message: { content: 'I can help with that' } },
      ]);

      outputFile = preprocessTranscript(inputFile, { truncateLines: 30 });
      const result = readJsonl(outputFile);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].type, 'assistant');
    });
  });

  describe('removing redundant fields', () => {
    it('should remove userType field', () => {
      inputFile = createTempJsonl([
        { type: 'user', userType: 'external', message: { content: 'test' } },
      ]);

      outputFile = preprocessTranscript(inputFile, { truncateLines: 30 });
      const result = readJsonl(outputFile);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].userType, undefined);
    });

    it('should remove isSidechain field', () => {
      inputFile = createTempJsonl([
        { type: 'user', isSidechain: false, message: { content: 'test' } },
      ]);

      outputFile = preprocessTranscript(inputFile, { truncateLines: 30 });
      const result = readJsonl(outputFile);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].isSidechain, undefined);
    });

    it('should remove cwd field', () => {
      inputFile = createTempJsonl([
        { type: 'user', cwd: '/Users/test/project', message: { content: 'test' } },
      ]);

      outputFile = preprocessTranscript(inputFile, { truncateLines: 30 });
      const result = readJsonl(outputFile);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].cwd, undefined);
    });

    it('should remove version field', () => {
      inputFile = createTempJsonl([
        { type: 'user', version: '1.0.0', message: { content: 'test' } },
      ]);

      outputFile = preprocessTranscript(inputFile, { truncateLines: 30 });
      const result = readJsonl(outputFile);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].version, undefined);
    });

    it('should remove gitBranch field', () => {
      inputFile = createTempJsonl([
        { type: 'user', gitBranch: 'main', message: { content: 'test' } },
      ]);

      outputFile = preprocessTranscript(inputFile, { truncateLines: 30 });
      const result = readJsonl(outputFile);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].gitBranch, undefined);
    });

    it('should remove message.role field', () => {
      inputFile = createTempJsonl([
        { type: 'user', message: { role: 'user', content: 'test' } },
      ]);

      outputFile = preprocessTranscript(inputFile, { truncateLines: 30 });
      const result = readJsonl(outputFile);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].message.role, undefined);
      assert.strictEqual(result[0].message.content, 'test');
    });

    it('should preserve other fields', () => {
      inputFile = createTempJsonl([
        {
          type: 'user',
          timestamp: '2024-01-15T10:00:00Z',
          sessionId: 'abc123',
          message: { content: 'test', model: 'claude-3' },
        },
      ]);

      outputFile = preprocessTranscript(inputFile, { truncateLines: 30 });
      const result = readJsonl(outputFile);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].timestamp, '2024-01-15T10:00:00Z');
      assert.strictEqual(result[0].sessionId, 'abc123');
      assert.strictEqual(result[0].message.model, 'claude-3');
    });
  });

  describe('truncating large tool results', () => {
    describe('string content', () => {
      it('should truncate string content exceeding TRUNCATE_LINES * 2', () => {
        // Create 100 lines of content (exceeds 30 * 2 = 60)
        const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
        const toolResult = {
          type: 'tool_result',
          content: lines.join('\n'),
        };

        inputFile = createTempJsonl([
          { type: 'assistant', message: { content: [toolResult] } },
        ]);

        outputFile = preprocessTranscript(inputFile, { truncateLines: 30 });
        const result = readJsonl(outputFile);

        const outputContent = result[0].message.content[0].content;
        const outputLines = outputContent.split('\n');

        // Should be 30 + 3 (marker lines) + 30 = 63 lines total
        assert.strictEqual(outputLines.length, 63);
        assert.strictEqual(outputLines[0], 'line 1');
        assert.strictEqual(outputLines[29], 'line 30');
        assert.ok(outputLines[31].includes('truncated'));
        assert.strictEqual(outputLines[outputLines.length - 1], 'line 100');
      });

      it('should keep first TRUNCATE_LINES and last TRUNCATE_LINES', () => {
        // Create 80 lines of content
        const lines = Array.from({ length: 80 }, (_, i) => `content-${i + 1}`);
        const toolResult = {
          type: 'tool_result',
          content: lines.join('\n'),
        };

        inputFile = createTempJsonl([
          { type: 'assistant', message: { content: [toolResult] } },
        ]);

        outputFile = preprocessTranscript(inputFile, { truncateLines: 30 });
        const result = readJsonl(outputFile);

        const outputContent = result[0].message.content[0].content;
        const outputLines = outputContent.split('\n');

        // First 30 lines preserved
        assert.strictEqual(outputLines[0], 'content-1');
        assert.strictEqual(outputLines[29], 'content-30');

        // Last 30 lines preserved
        assert.strictEqual(outputLines[outputLines.length - 1], 'content-80');
        assert.strictEqual(outputLines[outputLines.length - 30], 'content-51');
      });

      it('should insert truncation marker with line count', () => {
        // Create 100 lines (100 - 60 = 40 lines truncated)
        const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`);
        const toolResult = {
          type: 'tool_result',
          content: lines.join('\n'),
        };

        inputFile = createTempJsonl([
          { type: 'assistant', message: { content: [toolResult] } },
        ]);

        outputFile = preprocessTranscript(inputFile, { truncateLines: 30 });
        const result = readJsonl(outputFile);

        const outputContent = result[0].message.content[0].content;

        // Should contain marker indicating 40 lines were truncated
        assert.ok(outputContent.includes('truncated 40 lines'));
      });

      it('should preserve content under threshold unchanged', () => {
        // Create 50 lines (under 60 threshold)
        const lines = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`);
        const toolResult = {
          type: 'tool_result',
          content: lines.join('\n'),
        };

        inputFile = createTempJsonl([
          { type: 'assistant', message: { content: [toolResult] } },
        ]);

        outputFile = preprocessTranscript(inputFile, { truncateLines: 30 });
        const result = readJsonl(outputFile);

        const outputContent = result[0].message.content[0].content;
        const outputLines = outputContent.split('\n');

        assert.strictEqual(outputLines.length, 50);
        assert.ok(!outputContent.includes('truncated'));
      });
    });

    describe('array content (multi-part tool results)', () => {
      it('should truncate text items exceeding TRUNCATE_LINES * 2', () => {
        // Create 100 lines in a text item
        const lines = Array.from({ length: 100 }, (_, i) => `text line ${i + 1}`);
        const toolResult = {
          type: 'tool_result',
          content: [{ type: 'text', text: lines.join('\n') }],
        };

        inputFile = createTempJsonl([
          { type: 'assistant', message: { content: [toolResult] } },
        ]);

        outputFile = preprocessTranscript(inputFile, { truncateLines: 30 });
        const result = readJsonl(outputFile);

        const textItem = result[0].message.content[0].content[0];
        const outputLines = textItem.text.split('\n');

        // Should be truncated to 63 lines (30 + 3 marker + 30)
        assert.strictEqual(outputLines.length, 63);
        assert.ok(textItem.text.includes('truncated'));
      });

      it('should preserve non-text items in array', () => {
        const toolResult = {
          type: 'tool_result',
          content: [
            { type: 'image', source: { type: 'base64', data: 'abc123' } },
            { type: 'text', text: 'short text' },
          ],
        };

        inputFile = createTempJsonl([
          { type: 'assistant', message: { content: [toolResult] } },
        ]);

        outputFile = preprocessTranscript(inputFile, { truncateLines: 30 });
        const result = readJsonl(outputFile);

        const outputContent = result[0].message.content[0].content;

        assert.strictEqual(outputContent.length, 2);
        assert.strictEqual(outputContent[0].type, 'image');
        assert.strictEqual(outputContent[0].source.data, 'abc123');
      });

      it('should preserve small text items unchanged', () => {
        const toolResult = {
          type: 'tool_result',
          content: [
            { type: 'text', text: 'line 1\nline 2\nline 3' },
          ],
        };

        inputFile = createTempJsonl([
          { type: 'assistant', message: { content: [toolResult] } },
        ]);

        outputFile = preprocessTranscript(inputFile, { truncateLines: 30 });
        const result = readJsonl(outputFile);

        const textItem = result[0].message.content[0].content[0];
        assert.strictEqual(textItem.text, 'line 1\nline 2\nline 3');
      });
    });
  });

  describe('output validity', () => {
    it('should output valid JSONL (each line is valid JSON)', () => {
      inputFile = createTempJsonl([
        { type: 'user', message: { content: 'first' } },
        { type: 'assistant', message: { content: 'second' } },
        { type: 'user', message: { content: 'third' } },
      ]);

      outputFile = preprocessTranscript(inputFile, { truncateLines: 30 });

      // Read raw content and parse each line
      const content = fs.readFileSync(outputFile, 'utf8');
      const lines = content.trim().split('\n');

      assert.strictEqual(lines.length, 3);

      // Each line should be valid JSON
      for (const line of lines) {
        assert.doesNotThrow(() => JSON.parse(line), 'Each line should be valid JSON');
      }
    });

    it('should return path to temp file', () => {
      inputFile = createTempJsonl([
        { type: 'user', message: { content: 'test' } },
      ]);

      outputFile = preprocessTranscript(inputFile, { truncateLines: 30 });

      assert.strictEqual(typeof outputFile, 'string');
      assert.ok(fs.existsSync(outputFile));
      assert.notStrictEqual(outputFile, inputFile);
    });

    it('should handle empty transcript', () => {
      inputFile = createTempJsonl([]);

      outputFile = preprocessTranscript(inputFile, { truncateLines: 30 });

      assert.ok(fs.existsSync(outputFile));
      const content = fs.readFileSync(outputFile, 'utf8');
      assert.strictEqual(content.trim(), '');
    });

    it('should skip/handle malformed JSON lines gracefully', () => {
      const tmpDir = os.tmpdir();
      inputFile = path.join(tmpDir, `test-malformed-${Date.now()}.jsonl`);

      // Write a mix of valid and invalid JSON lines
      const content = [
        JSON.stringify({ type: 'user', message: { content: 'valid1' } }),
        'this is not valid json {{{',
        JSON.stringify({ type: 'assistant', message: { content: 'valid2' } }),
        '',
        JSON.stringify({ type: 'user', message: { content: 'valid3' } }),
      ].join('\n');
      fs.writeFileSync(inputFile, content);

      // Should not throw, should skip invalid lines
      outputFile = preprocessTranscript(inputFile, { truncateLines: 30 });

      const result = readJsonl(outputFile);
      // Should have 3 valid entries (malformed line skipped)
      assert.strictEqual(result.length, 3);
    });
  });

  describe('size reduction', () => {
    it('should produce smaller output than input when metadata present', () => {
      inputFile = createTempJsonl([
        {
          type: 'user',
          userType: 'external',
          isSidechain: false,
          cwd: '/very/long/path/to/project/directory',
          version: '1.2.3',
          gitBranch: 'feature/some-long-branch-name',
          message: { role: 'user', content: 'hello' },
        },
        {
          type: 'assistant',
          userType: 'external',
          isSidechain: false,
          cwd: '/very/long/path/to/project/directory',
          version: '1.2.3',
          gitBranch: 'feature/some-long-branch-name',
          message: { role: 'assistant', content: 'hi there' },
        },
      ]);

      outputFile = preprocessTranscript(inputFile, { truncateLines: 30 });

      const inputSize = fs.statSync(inputFile).size;
      const outputSize = fs.statSync(outputFile).size;

      assert.ok(
        outputSize < inputSize,
        `Output (${outputSize} bytes) should be smaller than input (${inputSize} bytes)`
      );
    });

    it('should produce smaller output when large tool results truncated', () => {
      // Create a large tool result (1000 lines)
      const lines = Array.from({ length: 1000 }, (_, i) => `line ${i}: some content here to make it longer`);
      const toolResult = {
        type: 'tool_result',
        content: lines.join('\n'),
      };

      inputFile = createTempJsonl([
        { type: 'assistant', message: { content: [toolResult] } },
      ]);

      outputFile = preprocessTranscript(inputFile, { truncateLines: 30 });

      const inputSize = fs.statSync(inputFile).size;
      const outputSize = fs.statSync(outputFile).size;

      // With 1000 lines truncated to ~63, should be much smaller
      assert.ok(
        outputSize < inputSize * 0.2,
        `Output (${outputSize} bytes) should be much smaller than input (${inputSize} bytes)`
      );
    });
  });

  describe('character-based truncation', () => {
    it('should truncate very long single-line content by character count', () => {
      // Create a single line of 100KB content (exceeds 50KB threshold)
      const longLine = 'x'.repeat(100000);
      const toolResult = {
        type: 'tool_result',
        content: longLine,
      };

      inputFile = createTempJsonl([
        { type: 'assistant', message: { content: [toolResult] } },
      ]);

      outputFile = preprocessTranscript(inputFile, { truncateLines: 30 });
      const result = readJsonl(outputFile);

      const outputContent = result[0].message.content[0].content;

      // Should be truncated and contain the marker
      assert.ok(outputContent.length < longLine.length, 'content should be truncated');
      assert.ok(outputContent.includes('truncated'), 'should contain truncation marker');
      assert.ok(outputContent.includes('characters'), 'marker should mention characters');
    });

    it('should keep content under 50KB threshold unchanged', () => {
      // Create a single line under the threshold
      const shortLine = 'x'.repeat(40000);
      const toolResult = {
        type: 'tool_result',
        content: shortLine,
      };

      inputFile = createTempJsonl([
        { type: 'assistant', message: { content: [toolResult] } },
      ]);

      outputFile = preprocessTranscript(inputFile, { truncateLines: 30 });
      const result = readJsonl(outputFile);

      const outputContent = result[0].message.content[0].content;

      // Should not be truncated
      assert.strictEqual(outputContent.length, shortLine.length);
      assert.ok(!outputContent.includes('truncated'), 'should not contain truncation marker');
    });

    it('should truncate minified JS style content (long single line)', () => {
      // Simulate minified JS - long line with no newlines
      const minifiedJS = 'function a(){' + 'var x=1;'.repeat(10000) + '}';
      const toolResult = {
        type: 'tool_result',
        content: minifiedJS,
      };

      inputFile = createTempJsonl([
        { type: 'assistant', message: { content: [toolResult] } },
      ]);

      outputFile = preprocessTranscript(inputFile, { truncateLines: 30 });
      const result = readJsonl(outputFile);

      const outputContent = result[0].message.content[0].content;

      assert.ok(outputContent.length < minifiedJS.length, 'minified JS should be truncated');
      assert.ok(outputContent.startsWith('function a(){'), 'should preserve start');
      assert.ok(outputContent.endsWith('}'), 'should preserve end');
    });
  });

  describe('temp file uniqueness', () => {
    it('should generate unique temp files for concurrent calls', async () => {
      inputFile = createTempJsonl([
        { type: 'user', message: { content: 'test' } },
      ]);

      // Make multiple concurrent calls
      const results = await Promise.all([
        Promise.resolve(preprocessTranscript(inputFile, { truncateLines: 30 })),
        Promise.resolve(preprocessTranscript(inputFile, { truncateLines: 30 })),
        Promise.resolve(preprocessTranscript(inputFile, { truncateLines: 30 })),
      ]);

      // All paths should be unique
      const uniquePaths = new Set(results);
      assert.strictEqual(uniquePaths.size, 3, 'all temp file paths should be unique');

      // Clean up
      for (const file of results) {
        try { fs.unlinkSync(file); } catch {}
      }
    });

    it('should include random component in temp filename', () => {
      inputFile = createTempJsonl([
        { type: 'user', message: { content: 'test' } },
      ]);

      outputFile = preprocessTranscript(inputFile, { truncateLines: 30 });

      // The filename should have a random component (alphanumeric after the PID)
      const filename = path.basename(outputFile);
      // Pattern: preprocessed-transcript-{timestamp}-{pid}-{random}.jsonl
      const parts = filename.split('-');
      assert.ok(parts.length >= 5, 'filename should have multiple parts including random suffix');
    });
  });
});
