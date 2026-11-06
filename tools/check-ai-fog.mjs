// F-122: bots may only see the game through BotView. Every file in src/ai except view.ts must not
// import the simulation's state modules or reach into sim internals.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN = [
  [/from ['"]\.\.\/sim\/(sim|military|serialize|stats|world\/fog)['"]/, 'imports sim state module'],
  [/\.ents\b/, 'touches sim.ents'], [/\.tileOwner\b/, 'touches tileOwner'], [/\.fog\b/, 'touches fog'], [/\bsim\./, 'uses a sim object'],
];
const files = readdirSync('src/ai').filter((f) => f.endsWith('.ts') && f !== 'view.ts' && f !== 'manager.ts'); // manager only plumbs views and commands
const problems = [];
for (const f of files) {
  const src = readFileSync(join('src/ai', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  src.split('\n').forEach((line, i) => { for (const [re, why] of FORBIDDEN) if (re.test(line)) problems.push(`src/ai/${f}:${i + 1}: ${why}: ${line.trim()}`); });
}
if (problems.length) { console.error('check-ai-fog FAILED\n' + problems.join('\n')); process.exit(1); }
console.log(`check-ai-fog OK (${files.length} bot files use only BotView)`);
