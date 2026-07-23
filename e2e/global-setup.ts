import { spawn } from 'node:child_process';
import { once } from 'node:events';

const serverUrl = 'http://127.0.0.1:3110/login';

async function waitForServer(timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(serverUrl);
      if (response.ok) return;
    } catch {
      // The production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`CRM test server did not become ready at ${serverUrl}.`);
}

export default async function globalSetup() {
  const server = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '-p', '3110'],
    {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: 'ignore',
    },
  );

  server.once('exit', (code) => {
    if (code && code !== 0) {
      console.error(`CRM test server exited unexpectedly with code ${code}.`);
    }
  });

  try {
    await waitForServer(30_000);
  } catch (error) {
    server.kill();
    throw error;
  }

  return async () => {
    if (server.exitCode !== null) return;
    server.kill();
    await Promise.race([
      once(server, 'exit'),
      new Promise((resolve) => setTimeout(resolve, 3_000)),
    ]);
  };
}
