import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { requireSession, unauthorizedResponse } from "@/lib/apiAuth";
import {
  CLUSTER_COMPOSE_FILE,
  CLUSTER_DIR,
  CLUSTER_ENV_DEFAULT_FILE,
  CLUSTER_ENV_EFFECTIVE_FILE,
  CLUSTER_ENV_OVERRIDE_FILE,
} from "@/lib/cluster";
import { parseEnvText, serializeEnv } from "@/lib/envfile";
import { runDockerCompose } from "@/lib/compose";

type Action = "up" | "down";

function ensureEffectiveEnvExists() {
  // Minimal generation: base default.cluster (or .env.sample) merged with override .cluster.edit.
  const basePath = fs.existsSync(CLUSTER_ENV_DEFAULT_FILE)
    ? CLUSTER_ENV_DEFAULT_FILE
    : path.join(CLUSTER_DIR, ".env.sample");

  if (!fs.existsSync(basePath)) {
    throw new Error("Base env file not found for cluster");
  }

  const base = parseEnvText(fs.readFileSync(basePath, "utf8"));
  const override = fs.existsSync(CLUSTER_ENV_OVERRIDE_FILE)
    ? parseEnvText(fs.readFileSync(CLUSTER_ENV_OVERRIDE_FILE, "utf8"))
    : {};

  const merged = { ...base, ...override };
  fs.writeFileSync(CLUSTER_ENV_EFFECTIVE_FILE, serializeEnv(merged), "utf8");
}

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

    ensureEffectiveEnvExists();

    const args = [
      "compose",
      "-f",
      CLUSTER_COMPOSE_FILE,
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
  } catch (error: any) {
    const stdout = typeof error?.stdout === "string" ? error.stdout : "";
    const stderr = typeof error?.stderr === "string" ? error.stderr : "";
    const exitCode =
      typeof error?.code === "number" || typeof error?.code === "string" ? error.code : null;

    return NextResponse.json(
      {
        error: error?.message || "Cluster compose failed",
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
