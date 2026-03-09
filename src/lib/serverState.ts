type StatusTarget = {
  state: string;
  health?: string;
  isStopping?: boolean;
  detailedState?: string;
};

export function normalizeDetailedState(state?: string): string | undefined {
  const value = (state || "").trim();
  return value ? value.toUpperCase() : undefined;
}

export function isPausingDetailedState(state?: string): boolean {
  return normalizeDetailedState(state) === "PAUSING";
}

export function isPausedDetailedState(state?: string): boolean {
  return normalizeDetailedState(state) === "PAUSED";
}

export function isContainerActionLocked(target: Pick<StatusTarget, "isStopping" | "detailedState">): boolean {
  return Boolean(target.isStopping) || isPausingDetailedState(target.detailedState);
}

export function canExecuteRcon(target: StatusTarget): boolean {
  if (target.state !== "running") return false;
  if (target.health !== "healthy") return false;
  if (target.isStopping) return false;

  const detailedState = normalizeDetailedState(target.detailedState);
  if (detailedState === "PAUSING" || detailedState === "PAUSED" || detailedState === "STOPPING") {
    return false;
  }

  return true;
}
