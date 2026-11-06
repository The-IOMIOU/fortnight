// F-003: every non-code asset file must be listed in ASSETS.md with a license.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const ASSET = /\.(png|jpe?g|gif|webp|svg|ogg|mp3|wav|flac|glb|gltf|ttf|otf|woff2?)$/i;
const tracked = execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8' }).split('\n').filter((f) => ASSET.test(f));
const md = readFileSync('ASSETS.md', 'utf8');
const missing = tracked.filter((f) => !md.includes(f));
if (missing.length) { console.error('check-assets FAILED, unlisted:\n  ' + missing.join('\n  ')); process.exit(1); }
console.log(`check-assets OK (${tracked.length} asset files, all listed)`);
