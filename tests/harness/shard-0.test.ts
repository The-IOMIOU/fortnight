import { expect, it } from 'vitest';
import { runShard } from './run';
it('harness shard 0', () => { const r = runShard(0); expect(Array.isArray(r)).toBe(true); });
