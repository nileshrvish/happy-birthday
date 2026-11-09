// Runs a Blender script headless: node blender/scripts/run_blender.mjs build_world.py [args]
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const candidates = [process.env.BLENDER, 'C:/Program Files/Blender Foundation/Blender 4.5/blender.exe', '/Applications/Blender.app/Contents/MacOS/Blender', 'blender'].filter(Boolean);
const blender = candidates.find((c) => c === 'blender' || existsSync(c));
const [script = 'build_world.py', ...rest] = process.argv.slice(2);
const r = spawnSync(blender, ['-b', '--factory-startup', '--python', path.join(here, script), '--', ...rest], { stdio: 'inherit' });
process.exit(r.status ?? 1);
