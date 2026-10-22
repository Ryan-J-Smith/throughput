import { describe, expect, it } from 'vitest';
import { runSummary } from '../browser';
import { buildQaEnding } from '../qa';

describe('THROUGHPUT visual QA endings', () => {
  it('the victory scene really wins', () => {
    const { run } = buildQaEnding(true);
    expect(run.phase).toBe('won');
  });

  it('the defeat scene loses at the Year 1 Board by a believable margin', () => {
    const { run } = buildQaEnding(false);
    expect(run.phase).toBe('lost');
    const last = run.history[run.history.length - 1];
    expect(last?.round).toBe(3);
    expect(runSummary(run).outcome).toMatch(/^Missed the Year 1 Board Review target by \$\d{1,3}\.$/);
  });
});
