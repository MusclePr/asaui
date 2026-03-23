import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { requireSession, unauthorizedResponse } from "@/lib/apiAuth";
import {
  CLUSTER_COMPOSE_FILE,
  CLUSTER_DIR,
  SIGNAL_DIR,
} from "@/lib/cluster";
import { runDockerCompose } from "@/lib/compose";

type Action = "up" | "down" | "cleanup-signals";

type ComposeCommandError = {
  stdout?: unknown;
  stderr?: unknown;
  code?: unknown;
  message?: unknown;
};

function findLockEntriesInSignalsRoot(): string[] {
  if (!fs.existsSync(SIGNAL_DIR)) {
    return [];
  }

  const lockEntries: string[] = [];
  const rootEntries = fs.readdirSync(SIGNAL_DIR, { withFileTypes: true });

  for (const rootEntry of rootEntries) {
    if (!rootEntry.isDirectory()) continue;

    const childDir = path.join(SIGNAL_DIR, rootEntry.name);
    const children = fs.readdirSync(childDir, { withFileTypes: true });
    for (const child of children) {
      if (!child.name.endsWith(".lock")) continue;
      lockEntries.push(path.join(childDir, child.name));
    }
  }

  return lockEntries;
}

function isComposeStopped(psStdout: string): boolean {
  const lines = psStdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  // Header-only output means no compose-managed containers are present.
  return lines.length <= 1;
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    const { action } = (await req.json()) as { action?: Action };
    if (action !== "up" && action !== "down" && action !== "cleanup-signals") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    if (action === "cleanup-signals") {
      const lockEntries = findLockEntriesInSignalsRoot();
      if (lockEntries.length === 0) {
        return NextResponse.json(
          {
            error: "cleanup-signals cannot run: no .signals/*/*.lock entries found",
            action,
            lockEntries,
          },
          { status: 400 }
        );
      }

      const psArgs = ["compose", "--project-directory", CLUSTER_DIR, "ps"];
      const startedAt = Date.now();
      const { stdout: psStdout, stderr: psStderr } = await runDockerCompose(psArgs, { cwd: CLUSTER_DIR });
      const composeStopped = isComposeStopped(psStdout);

      if (!composeStopped) {
        return NextResponse.json(
          {
            error: "cleanup-signals cannot run: compose-managed containers still exist",
            action,
            command: "docker",
            args: psArgs,
            cwd: CLUSTER_DIR,
            stdout: psStdout,
            stderr: psStderr,
            lockEntries,
          },
          { status: 400 }
        );
      }

      const removedPath = SIGNAL_DIR;
      const existedBefore = fs.existsSync(removedPath);
      if (existedBefore) {
        fs.rmSync(removedPath, { recursive: true, force: true });
      }
      const finishedAt = Date.now();

      return NextResponse.json({
        success: true,
        action,
        command: "docker",
        args: psArgs,
        cwd: CLUSTER_DIR,
        startedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
        stdout: psStdout,
        stderr: psStderr,
        lockEntries,
        composeStopped,
        removedPath,
        removed: existedBefore,
      });
    }

    if (!fs.existsSync(CLUSTER_COMPOSE_FILE)) {
      return NextResponse.json(
        { error: `compose.yml not found: ${CLUSTER_COMPOSE_FILE}` },
        { status: 500 }
      );
    }

    const args = [
      "compose",
      // これを指定すると、暗黙的に読み込まれるはずの compose.override.yml が読み込まれなくなるので、コメントアウトしています。
      //"-f",
      //CLUSTER_COMPOSE_FILE,
      action,
    ];

    if (action === "up") {
      args.push("-d");
    }

    const startedAt = Date.now();
    const { stdout, stderr } = await runDockerCompose(args, { cwd: CLUSTER_DIR });
    const finishedAt = Date.now();

    return NextResponse.json({
      success: true,
      action,
      command: "docker",
      args,
      cwd: CLUSTER_DIR,
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
      stdout,
      stderr,
    });
  } catch (error: unknown) {
    const commandError = (error ?? {}) as ComposeCommandError;
    const stdout = typeof commandError.stdout === "string" ? commandError.stdout : "";
    const stderr = typeof commandError.stderr === "string" ? commandError.stderr : "";
    const exitCode =
      typeof commandError.code === "number" || typeof commandError.code === "string" ? commandError.code : null;

    return NextResponse.json(
      {
        error: typeof commandError.message === "string" ? commandError.message : "Cluster compose failed",
        action: undefined,
        command: "docker",
        cwd: CLUSTER_DIR,
        exitCode,
        stdout,
        stderr,
      },
      { status: 500 }
    );
  }
}
