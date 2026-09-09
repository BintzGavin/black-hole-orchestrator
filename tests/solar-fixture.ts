import type { AgentRole } from "../shared/schema";

// Synthetic records for the local visual preview and browser checks only.
// The standalone preview never persists these records. Integration tests seed
// derived records only into their explicitly fresh, nonpersistent browser context.
const names = [
  "Frontend",
  "Backend",
  "Quality",
  "Orchestrator",
  "Infrastructure",
  "Design",
  "Accessibility",
  "Observability",
  "Documentation",
  "Security",
  "Performance",
  "Release",
] as const;

const tasks = [
  "Refine the repository workspace",
  "Validate the execution boundary",
  "Verify the agent lifecycle",
  "Coordinate the next planning cycle",
  "Prepare the local runtime",
  "Review the interaction hierarchy",
  "Audit keyboard navigation",
  "Trace the latest operation",
  "Update the contributor guide",
  "Review the permission boundary",
  "Measure the rendering budget",
  "Prepare the release review",
] as const;

export function createPreviewRoles(
  count = 6,
  firstStatus = "active",
): AgentRole[] {
  return names.slice(0, count).map((name, index) => ({
    id: `preview-agent-${String(index + 1).padStart(2, "0")}`,
    repositoryId: "synthetic-solar-preview",
    name,
    description: `The ${name.toLowerCase()} agent owns a focused part of this synthetic repository.`,
    files: [{ path: `plans/${name.toLowerCase()}-preview.md`, type: "plan" }],
    category: index === 3 ? "shared" : "domain",
    boundaries: [name.toLowerCase()],
    status:
      index === 0
        ? firstStatus
        : ["active", "idle", "saturated", "active", "stuck", "drifting"][
            index % 6
          ]!,
    planCount: (index % 4) + 1,
    prCount: index % 3,
    lastActiveAt: "2026-09-09T12:00:00.000Z",
    createdAt: "2026-09-09T12:00:00.000Z",
  }));
}

export const sampleAgentRoles = createPreviewRoles();

export function createPreviewAgentStates(roles: AgentRole[]) {
  return roles.map((role, index) => ({
    agentName: role.name,
    currentStatus: role.status ?? "unknown",
    recentTask: tasks[index] ?? "Review the next synthetic task",
  }));
}
