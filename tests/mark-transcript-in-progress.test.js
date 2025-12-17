/**
 * Tests for markTranscriptInProgress function
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { markTranscriptInProgress } from '../scripts/trigger.js';

describe('markTranscriptInProgress', () => {
  it('should set status to "in_progress"', () => {
    const state = {
      version: 1,
      transcripts: {},
    };

    const result = markTranscriptInProgress(state, '/path/to/transcript.jsonl');

    assert.strictEqual(
      result.transcripts['/path/to/transcript.jsonl'].status,
      'in_progress',
      'Status should be set to "in_progress"'
    );
  });

  it('should set started_at to ISO timestamp', () => {
    const state = {
      version: 1,
      transcripts: {},
    };

    const before = new Date();
    const result = markTranscriptInProgress(state, '/path/to/transcript.jsonl');
    const after = new Date();

    const startedAt = result.transcripts['/path/to/transcript.jsonl'].started_at;

    // Verify it's a valid ISO timestamp
    assert.ok(startedAt, 'started_at should be set');
    const parsed = new Date(startedAt);
    assert.ok(!isNaN(parsed.getTime()), 'started_at should be a valid date');

    // Verify timestamp is between before and after
    assert.ok(
      parsed >= before && parsed <= after,
      'started_at should be set to current time'
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
          status: 'failed',
          failed_at: '2024-01-13T08:00:00.000Z',
          exit_code: 1,
        },
      },
    };

    const result = markTranscriptInProgress(state, '/path/to/transcript-c.jsonl');

    // transcript-a should be unchanged
    assert.deepStrictEqual(
      result.transcripts['/path/to/transcript-a.jsonl'],
      {
        status: 'completed',
        analyzed_at: '2024-01-14T09:00:00.000Z',
      },
      'transcript-a should be unchanged'
    );

    // transcript-b should be unchanged
    assert.deepStrictEqual(
      result.transcripts['/path/to/transcript-b.jsonl'],
      {
        status: 'failed',
        failed_at: '2024-01-13T08:00:00.000Z',
        exit_code: 1,
      },
      'transcript-b should be unchanged'
    );

    // transcript-c should be added with in_progress status
    assert.strictEqual(
      result.transcripts['/path/to/transcript-c.jsonl'].status,
      'in_progress',
      'transcript-c status should be in_progress'
    );
  });

  it('should preserve state version', () => {
    const state = {
      version: 1,
      transcripts: {},
    };

    const result = markTranscriptInProgress(state, '/path/to/transcript.jsonl');

    assert.strictEqual(result.version, 1, 'Version should be preserved');
  });

  it('should not mutate the original state object', () => {
    const state = {
      version: 1,
      transcripts: {
        '/path/to/existing.jsonl': {
          status: 'completed',
          analyzed_at: '2024-01-14T09:00:00.000Z',
        },
      },
    };

    const originalState = JSON.parse(JSON.stringify(state));
    markTranscriptInProgress(state, '/path/to/transcript.jsonl');

    assert.deepStrictEqual(
      state,
      originalState,
      'Original state should not be mutated'
    );
  });
});
