import type { AgentRole } from "@shared/schema";

export interface AgentState {
  agentName: string;
  currentStatus: string;
  recentTask: string;
}
export interface AgentWorld {
  id: string;
  name: string;
  status: string;
  task: string;
  theme: number;
  radius: number;
  orbitRadius: number;
  angle: number;
  inclination: number;
  speed: number;
}
const STATUSES = new Set([
  "active",
  "idle",
  "stuck",
  "divergent",
  "saturated",
  "drifting",
  "unknown",
]);
export function resolveAgentStatus(
  stored: string | null,
  analyzed: string | undefined,
): string {
  const status = analyzed ?? stored ?? "unknown";
  return STATUSES.has(status) ? status : "unknown";
}
export const STATUS_COLOR: Record<string, number> = {
  active: 0x6edbae,
  idle: 0xa8b8ce,
  stuck: 0xf18d79,
  divergent: 0xeb927a,
  saturated: 0xeabd71,
  drifting: 0xf18d79,
  unknown: 0x9fa8bd,
};
export function createAgentWorlds(
  roles: AgentRole[],
  states: AgentState[],
): AgentWorld[] {
  const initialAngles = [-0.6, 2.55, 0.48, 3.75, 1.9, 5.2];
  const sizes = [7, 11, 20, 13, 10, 17];
  return roles.map((role, index) => {
    const state = states.find((state) => state.agentName === role.name);
    const activity = [role.planCount, role.prCount].reduce<number>(
      (sum, value) =>
        sum + (Number.isFinite(value) ? Math.max(0, value ?? 0) : 0),
      0,
    );
    return {
      id: role.id,
      name: role.name,
      status: resolveAgentStatus(role.status, state?.currentStatus),
      task: state?.recentTask ?? "",
      theme: index % 6,
      radius: sizes[index % 6] * (0.85 + Math.min(10, activity) * 0.025),
      orbitRadius: 92 + index * 50,
      angle: initialAngles[index % 6] + Math.floor(index / 6) * 0.52,
      inclination: [0.015, -0.025, 0.045, -0.018, 0.035, -0.038][index % 6],
      speed: 0.034 * Math.pow(92 / (92 + index * 50), 1.5),
    };
  });
}
export function orbitPosition(
  world: AgentWorld,
  time: number,
): [number, number, number] {
  const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
  const angle =
    world.angle +
    safeTime * world.speed * (world.status === "drifting" ? 0.35 : 1);
  const radius =
    world.orbitRadius *
    (world.status === "drifting"
      ? 1 + 0.1 * (1 - Math.exp(-safeTime / 80))
      : 1);
  return [
    Math.cos(angle) * radius,
    Math.sin(angle) * Math.sin(world.inclination) * radius,
    Math.sin(angle) * Math.cos(world.inclination) * radius,
  ];
}

/** Keep orbital phase continuous when live status changes the angular speed. */
export function preserveOrbitalPhase(
  previous: AgentWorld,
  next: AgentWorld,
  time: number,
): AgentWorld {
  const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
  const rate = (world: AgentWorld) =>
    world.speed * (world.status === "drifting" ? 0.35 : 1);
  return {
    ...next,
    angle: previous.angle + safeTime * (rate(previous) - rate(next)),
  };
}
