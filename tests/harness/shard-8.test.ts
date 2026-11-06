import { expect, it } from 'vitest';
import { runShard } from './run';
it('harness shard 8', () => { const r = runShard(8); expect(Array.isArray(r)).toBe(true); });
