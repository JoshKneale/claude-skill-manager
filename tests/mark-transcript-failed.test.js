/**
 * Tests for markTranscriptFailed function
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { markTranscriptFailed } from '../scripts/trigger.js';

describe('markTranscriptFailed', () => {
  it('should set status to "failed"', () => {
    const state = {
      version: 1,
      transcripts: {
        '/path/to/transcript.jsonl': {
          status: 'in_progress',
          started_at: '2024-01-15T10:00:00.000Z',
        },
      },
    };

    const result = markTranscriptFailed(state, '/path/to/transcript.jsonl', 1);

    assert.strictEqual(
      result.transcripts['/path/to/transcript.jsonl'].status,
      'failed',
      'Status should be set to "failed"'
    );
  });

  it('should set failed_at to ISO timestamp', () => {
    const state = {
      version: 1,
      transcripts: {
        '/path/to/transcript.jsonl': {
          status: 'in_progress',
          started_at: '2024-01-15T10:00:00.000Z',
        },
      },
    };

    const before = new Date();
    const result = markTranscriptFailed(state, '/path/to/transcript.jsonl', 1);
    const after = new Date();

    const failedAt = result.transcripts['/path/to/transcript.jsonl'].failed_at;

    // Verify it's a valid ISO timestamp
    assert.ok(failedAt, 'failed_at should be set');
    const parsed = new Date(failedAt);
    assert.ok(!isNaN(parsed.getTime()), 'failed_at should be a valid date');

    // Verify timestamp is between before and after
    assert.ok(
      parsed >= before && parsed <= after,
      'failed_at should be set to current time'
    );
  });

  it('should set exit_code to provided value', () => {
    const state = {
      version: 1,
      transcripts: {
        '/path/to/transcript.jsonl': {
          status: 'in_progress',
          started_at: '2024-01-15T10:00:00.000Z',
        },
      },
    };

    const result = markTranscriptFailed(state, '/path/to/transcript.jsonl', 42);

    assert.strictEqual(
      result.transcripts['/path/to/transcript.jsonl'].exit_code,
      42,
      'exit_code should be set to provided value'
    );
  });

  it('should remove in_progress fields', () => {
    const state = {
      version: 1,
      transcripts: {
        '/path/to/transcript.jsonl': {
          status: 'in_progress',
          started_at: '2024-01-15T10:00:00.000Z',
        },
      },
    };

    const result = markTranscriptFailed(state, '/path/to/transcript.jsonl', 1);

    assert.strictEqual(
      result.transcripts['/path/to/transcript.jsonl'].started_at,
      undefined,
      'started_at should be removed'
    );
  });

  it('should preserve other transcripts in state', () => {
    const state = {
      version: 1,
      transcripts: {
        '/path/to/transcript-a.jsonl': {
          status: 'completed',
          analyzed_at: '2024-01-14T09:00:00.000Z',
        },
        '/path/to/transcript-b.jsonl': {
          status: 'in_progress',
          started_at: '2024-01-15T10:00:00.000Z',
        },
        '/path/to/transcript-c.jsonl': {
          status: 'failed',
          failed_at: '2024-01-13T08:00:00.000Z',
          exit_code: 1,
        },
      },
    };

    const result = markTranscriptFailed(state, '/path/to/transcript-b.jsonl', 2);

    // transcript-a should be unchanged
    assert.deepStrictEqual(
      result.transcripts['/path/to/transcript-a.jsonl'],
      {
        status: 'completed',
        analyzed_at: '2024-01-14T09:00:00.000Z',
      },
      'transcript-a should be unchanged'
    );

    // transcript-c should be unchanged
    assert.deepStrictEqual(
      result.transcripts['/path/to/transcript-c.jsonl'],
      {
        status: 'failed',
        failed_at: '2024-01-13T08:00:00.000Z',
        exit_code: 1,
      },
      'transcript-c should be unchanged'
    );

    // transcript-b should be updated
    assert.strictEqual(
      result.transcripts['/path/to/transcript-b.jsonl'].status,
      'failed',
      'transcript-b status should be updated'
    );
  });

  it('should preserve state version', () => {
    const state = {
      version: 1,
      transcripts: {
        '/path/to/transcript.jsonl': {
          status: 'in_progress',
          started_at: '2024-01-15T10:00:00.000Z',
        },
      },
    };

    const result = markTranscriptFailed(state, '/path/to/transcript.jsonl', 1);

    assert.strictEqual(result.version, 1, 'Version should be preserved');
  });

  it('should handle transcript not previously in state', () => {
    const state = {
      version: 1,
      transcripts: {},
    };

    const result = markTranscriptFailed(state, '/path/to/new-transcript.jsonl', 127);

    assert.strictEqual(
      result.transcripts['/path/to/new-transcript.jsonl'].status,
      'failed',
      'New transcript should be added with failed status'
    );
    assert.ok(
      result.transcripts['/path/to/new-transcript.jsonl'].failed_at,
      'New transcript should have failed_at set'
    );
    assert.strictEqual(
      result.transcripts['/path/to/new-transcript.jsonl'].exit_code,
      127,
      'New transcript should have exit_code set'
    );
  });

  it('should not mutate the original state object', () => {
    const state = {
      version: 1,
      transcripts: {
        '/path/to/transcript.jsonl': {
          status: 'in_progress',
          started_at: '2024-01-15T10:00:00.000Z',
        },
      },
    };

    const originalState = JSON.parse(JSON.stringify(state));
    markTranscriptFailed(state, '/path/to/transcript.jsonl', 1);

    assert.deepStrictEqual(
      state,
      originalState,
      'Original state should not be mutated'
    );
  });

  it('should handle exit_code of 0', () => {
    const state = {
      version: 1,
      transcripts: {
        '/path/to/transcript.jsonl': {
          status: 'in_progress',
          started_at: '2024-01-15T10:00:00.000Z',
        },
      },
    };

    const result = markTranscriptFailed(state, '/path/to/transcript.jsonl', 0);

    assert.strictEqual(
      result.transcripts['/path/to/transcript.jsonl'].exit_code,
      0,
      'exit_code of 0 should be preserved (not falsy)'
    );
  });
});
