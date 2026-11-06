import { expect, it } from 'vitest';
import { runShard } from './run';
it('harness shard 1', () => { const r = runShard(1); expect(Array.isArray(r)).toBe(true); });
