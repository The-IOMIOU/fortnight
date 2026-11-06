import { expect, it } from 'vitest';
import { runShard } from './run';
it('harness shard 2', () => { const r = runShard(2); expect(Array.isArray(r)).toBe(true); });
