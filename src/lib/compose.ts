import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ComposeAction = "up" | "down";

export async function runDockerCompose(args: string[], options?: { cwd?: string }) {
  const { stdout, stderr } = await execFileAsync("docker", args, {
    cwd: options?.cwd,
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
  return { stdout, stderr };
}
