import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import { requireSession, unauthorizedResponse } from "@/lib/apiAuth";
import {
  CLUSTER_COMPOSE_FILE,
  CLUSTER_DIR,
} from "@/lib/cluster";
import { runDockerCompose } from "@/lib/compose";

type Action = "up" | "down";

type ComposeCommandError = {
  stdout?: unknown;
  stderr?: unknown;
  code?: unknown;
  message?: unknown;
};

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!session) return unauthorizedResponse();

  try {
    const { action } = (await req.json()) as { action?: Action };
    if (action !== "up" && action !== "down") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
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
