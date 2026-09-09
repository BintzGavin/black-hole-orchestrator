import { test } from "node:test";
import assert from "node:assert/strict";
import type { AgentRole } from "../shared/schema";
import {
  createAgentWorlds,
  resolveAgentStatus,
  orbitPosition,
  preserveOrbitalPhase,
} from "../client/src/components/solar/layout";
const role = (i: number): AgentRole => ({
  id: `role-${i}`,
  repositoryId: "repo",
  name: `Agent ${i}`,
  description: null,
  files: [],
  category: "domain",
  boundaries: null,
  status: "active",
  planCount: i,
  prCount: null,
  lastActiveAt: null,
  createdAt: "2026-01-01T00:00:00Z",
});
test("all real roles retain their identity and finite, separated orbits", () => {
  for (const count of [0, 1, 6, 12, 40]) {
    const roles = Array.from({ length: count }, (_, i) => role(i));
    const worlds = createAgentWorlds(roles, []);
    assert.equal(worlds.length, count);
    worlds.forEach((world, i) => {
      assert.equal(world.id, roles[i].id);
      assert.ok(world.radius > 0 && world.orbitRadius > world.radius * 4);
      assert.ok(orbitPosition(world, 100).every(Number.isFinite));
      if (i) assert.ok(world.orbitRadius > worlds[i - 1].orbitRadius);
    });
  }
});
test("analysis status takes precedence and unrecognized states are explicit", () => {
  assert.equal(resolveAgentStatus("active", "drifting"), "drifting");
  assert.equal(resolveAgentStatus("active", "idle"), "idle");
  assert.equal(resolveAgentStatus("stuck", undefined), "stuck");
  assert.equal(resolveAgentStatus("invalid", undefined), "unknown");
});
test("drifting worlds remain recoverable and activity changes do not create invalid geometry", () => {
  const worlds = createAgentWorlds(
    [{ ...role(0), status: "drifting", planCount: -20, prCount: NaN }],
    [],
  );
  const world = worlds[0];
  assert.ok(Number.isFinite(world.radius) && world.radius > 0);
  assert.ok(
    Math.hypot(...orbitPosition(world, 100000)) < world.orbitRadius * 1.2,
  );
  assert.notDeepEqual(orbitPosition(world, 0), orbitPosition(world, 1));
});
test("live status changes preserve orbital phase after a long-running session", () => {
  const active = createAgentWorlds([role(0)], [])[0];
  const time = 12000;
  const drifting = preserveOrbitalPhase(
    active,
    { ...active, status: "drifting" },
    time,
  );
  const restored = preserveOrbitalPhase(
    drifting,
    { ...active, status: "active" },
    time + 800,
  );
  const phase = (world: typeof active, at: number) => {
    const p = orbitPosition(world, at);
    return Math.atan2(p[2] / Math.cos(world.inclination), p[0]);
  };
  assert.ok(Math.abs(phase(active, time) - phase(drifting, time)) < 1e-10);
  assert.ok(
    Math.abs(phase(drifting, time + 800) - phase(restored, time + 800)) < 1e-10,
  );
});
