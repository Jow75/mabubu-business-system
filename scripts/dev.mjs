// Runs the API (wrangler, port 8787) and the app (vite, port 5173) together.
// Open http://localhost:5173 — vite forwards /api to wrangler.
import { spawn } from 'node:child_process';

const run = (name, args) => {
  const p = spawn('npx', args, { stdio: 'inherit', shell: true });
  p.on('exit', (code) => {
    console.log(`${name} stopped (${code}).`);
    shutdown();
  });
  return p;
};

const procs = [run('api', ['wrangler', 'dev', '--port', '8787', '--ip', '127.0.0.1']), run('app', ['vite'])];
let down = false;
function shutdown() {
  if (down) return;
  down = true;
  for (const p of procs) p.kill();
  process.exit();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
