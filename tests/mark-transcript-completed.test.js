/**
 * Tests for markTranscriptCompleted function
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { markTranscriptCompleted } from '../scripts/trigger.js';

describe('markTranscriptCompleted', () => {
  it('should set status to "completed"', () => {
    const state = {
      version: 1,
      transcripts: {
        '/path/to/transcript.jsonl': {
          status: 'in_progress',
          started_at: '2024-01-15T10:00:00.000Z',
        },
      },
    };

    const result = markTranscriptCompleted(state, '/path/to/transcript.jsonl');

    assert.strictEqual(
      result.transcripts['/path/to/transcript.jsonl'].status,
      'completed',
      'Status should be set to "completed"'
    );
  });

  it('should set analyzed_at to ISO timestamp', () => {
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
    const result = markTranscriptCompleted(state, '/path/to/transcript.jsonl');
    const after = new Date();

    const analyzedAt = result.transcripts['/path/to/transcript.jsonl'].analyzed_at;

    // Verify it's a valid ISO timestamp
    assert.ok(analyzedAt, 'analyzed_at should be set');
    const parsed = new Date(analyzedAt);
    assert.ok(!isNaN(parsed.getTime()), 'analyzed_at should be a valid date');

    // Verify timestamp is between before and after
    assert.ok(
      parsed >= before && parsed <= after,
      'analyzed_at should be set to current time'
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

    const result = markTranscriptCompleted(state, '/path/to/transcript.jsonl');

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

    const result = markTranscriptCompleted(state, '/path/to/transcript-b.jsonl');

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
      'completed',
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

    const result = markTranscriptCompleted(state, '/path/to/transcript.jsonl');

    assert.strictEqual(result.version, 1, 'Version should be preserved');
  });

  it('should handle transcript not previously in state', () => {
    const state = {
      version: 1,
      transcripts: {},
    };

    const result = markTranscriptCompleted(state, '/path/to/new-transcript.jsonl');

    assert.strictEqual(
      result.transcripts['/path/to/new-transcript.jsonl'].status,
      'completed',
      'New transcript should be added with completed status'
    );
    assert.ok(
      result.transcripts['/path/to/new-transcript.jsonl'].analyzed_at,
      'New transcript should have analyzed_at set'
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
    markTranscriptCompleted(state, '/path/to/transcript.jsonl');

    assert.deepStrictEqual(
      state,
      originalState,
      'Original state should not be mutated'
    );
  });
});
