// F-004: keep the repository small — no large or binary files committed.
import { execSync } from 'node:child_process';
import { statSync } from 'node:fs';
const MAX = 200 * 1024;
const ALLOW_LARGE = new Set(['package-lock.json']);
const BINARY = /\.(png|jpe?g|gif|webp|ogg|mp3|wav|flac|glb|zip|7z|exe|dll|bin|psd|blend|fbx|mp4|webm)$/i;
const files = execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8' }).split('\n').filter(Boolean);
let total = 0;
const problems = [];
for (const f of files) {
  let size = 0;
  try { size = statSync(f).size; } catch { continue; }
  total += size;
  if (size > MAX && !ALLOW_LARGE.has(f)) problems.push(`${f}: ${(size / 1024).toFixed(0)} KB > 200 KB`);
  if (BINARY.test(f)) problems.push(`${f}: binary asset type`);
}
if (problems.length) { console.error('check-repo FAILED\n  ' + problems.join('\n  ')); process.exit(1); }
console.log(`check-repo OK (${files.length} files, ${(total / 1024).toFixed(0)} KB total)`);
