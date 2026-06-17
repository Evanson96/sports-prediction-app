import { spawn } from 'node:child_process';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const useShell = process.platform === 'win32';

const processes = [
  spawn(npmCmd, ['run', 'server'], { stdio: 'inherit', shell: useShell }),
  spawn(npmCmd, ['run', 'client'], { stdio: 'inherit', shell: useShell }),
];

const shutdown = () => {
  for (const child of processes) {
    if (!child.killed) child.kill();
  }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

for (const child of processes) {
  child.on('exit', (code) => {
    if (code && code !== 0) {
      shutdown();
      process.exit(code);
    }
  });
}
