import type { AgentRole } from "@shared/schema";
import type { CSSProperties, KeyboardEvent } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Circle,
  CircleDot,
  CircleHelp,
  Gauge,
  GitFork,
  Maximize2,
  Minimize2,
  MoveUpRight,
  Pause,
  Play,
  Rocket,
  RotateCcw,
} from "lucide-react";
import "./solar.css";

export interface SolarControlsProps {
  repoName: string;
  roles: AgentRole[];
  selectedId: string | null;
  hoveredId: string | null;
  statuses: Record<string, { status: string; task: string }>;
  paused: boolean;
  reducedMotion: boolean;
  cameraMode: "orbit" | "alien";
  loading: boolean;
  error: string | null;
  onSelect: (id: string) => void;
  onInspect: (id: string) => void;
  onReset: () => void;
  onPause: () => void;
  onCameraMode: (mode: "orbit" | "alien") => void;
  onFullscreen: () => void;
  fullscreen: boolean;
}

const WORLD_TEXTURES = [
  "cinder",
  "verdant",
  "aurelia",
  "glacial",
  "rust",
  "nereid",
] as const;
const STATUS_PRESENTATION = {
  active: { label: "Active", Icon: CircleDot },
  idle: { label: "Idle", Icon: Circle },
  stuck: { label: "Stuck", Icon: AlertTriangle },
  divergent: { label: "Divergent", Icon: GitFork },
  saturated: { label: "Saturated", Icon: Gauge },
  drifting: { label: "Drifting", Icon: MoveUpRight },
  unknown: { label: "Status unknown", Icon: CircleHelp },
} as const;

function roleState(role: AgentRole, statuses: SolarControlsProps["statuses"]) {
  const live = statuses[role.id] ?? statuses[role.name];
  const value = (live?.status ?? role.status ?? "unknown").toLowerCase();
  const status = Object.hasOwn(STATUS_PRESENTATION, value)
    ? (value as keyof typeof STATUS_PRESENTATION)
    : "unknown";
  return {
    status,
    task: live?.task?.trim() ?? "",
    ...STATUS_PRESENTATION[status],
  };
}

function navigateAgents(event: KeyboardEvent<HTMLElement>) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
  );
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (current < 0 || buttons.length === 0) return;
  event.preventDefault();
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : (current + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) %
          buttons.length;
  buttons[next]?.focus({ preventScroll: true });
  buttons[next]?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

export function SolarControls({
  repoName,
  roles,
  selectedId,
  hoveredId,
  statuses,
  paused,
  reducedMotion,
  cameraMode,
  loading,
  error,
  onSelect,
  onInspect,
  onReset,
  onPause,
  onCameraMode,
  onFullscreen,
  fullscreen,
}: SolarControlsProps) {
  const selectedRole = roles.find((role) => role.id === selectedId);
  const displayedRole =
    selectedRole ?? roles.find((role) => role.id === hoveredId);
  const state = displayedRole ? roleState(displayedRole, statuses) : null;
  const motionLabel = paused
    ? "Motion paused"
    : hoveredId
      ? "Paused for inspection"
      : "Celestial motion";
  const unavailable = loading;

  return (
    <section
      className="agent-solar-controls"
      aria-label="Agent solar system controls"
      data-camera-mode={cameraMode}
      data-motion-paused={paused || Boolean(hoveredId)}
      data-reduced-motion={reducedMotion}
    >
      <header className="agent-solar-header">
        <div className="agent-solar-identity">
          <span className="agent-solar-sigil" aria-hidden="true" />
          <div className="agent-solar-identity-copy">
            <h2 className="agent-solar-repository" title={repoName}>
              {repoName}
            </h2>
            <span className="agent-solar-subtitle">Agent solar system</span>
          </div>
        </div>
        <div
          className="agent-solar-toolbar"
          role="group"
          aria-label="Scene controls"
        >
          <button
            type="button"
            className="agent-solar-tool agent-solar-camera"
            aria-label="Spaceship camera"
            aria-pressed={cameraMode === "alien"}
            title={
              cameraMode === "alien"
                ? "Return to orbit view"
                : "Follow the spaceship"
            }
            disabled={unavailable}
            onClick={() =>
              onCameraMode(cameraMode === "orbit" ? "alien" : "orbit")
            }
          >
            <Rocket aria-hidden="true" />
            <span>Spaceship cam</span>
          </button>
          <button
            type="button"
            className="agent-solar-tool"
            aria-label="Pause motion"
            aria-pressed={paused}
            title={
              paused ? "Resume celestial motion" : "Pause celestial motion"
            }
            disabled={unavailable}
            onClick={onPause}
          >
            {paused ? (
              <Play aria-hidden="true" />
            ) : (
              <Pause aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className="agent-solar-tool"
            aria-label="Reset view"
            title="Reset view"
            disabled={unavailable}
            onClick={onReset}
          >
            <RotateCcw aria-hidden="true" />
          </button>
          <button
            type="button"
            className="agent-solar-tool"
            aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            title={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            onClick={onFullscreen}
          >
            {fullscreen ? (
              <Minimize2 aria-hidden="true" />
            ) : (
              <Maximize2 aria-hidden="true" />
            )}
          </button>
        </div>
      </header>

      {(loading || error) && (
        <div
          className="agent-solar-scene-notice"
          role={error ? "alert" : "status"}
        >
          {error ? (
            <AlertTriangle aria-hidden="true" />
          ) : (
            <span className="agent-solar-loading-mark" aria-hidden="true" />
          )}
          <div>
            <strong>
              {error ? "Scene notice" : "Preparing the observatory"}
            </strong>
            <p>
              {error ?? "Loading planetary surfaces and the repository core."}
            </p>
          </div>
        </div>
      )}

      <div className="agent-solar-bottom">
        <div className="agent-solar-context">
          <section
            className="agent-solar-details"
            aria-label="Agent world details"
            aria-live="polite"
            aria-atomic="true"
          >
            {displayedRole && state ? (
              <>
                <div className="agent-solar-detail-meta">
                  <span className="agent-solar-kind">
                    {displayedRole.category} agent
                  </span>
                  <span
                    className="agent-solar-status"
                    data-status={state.status}
                  >
                    <state.Icon aria-hidden="true" />
                    {state.label}
                  </span>
                </div>
                <h3 className="agent-solar-title">{displayedRole.name}</h3>
                {displayedRole.description && (
                  <p className="agent-solar-description">
                    {displayedRole.description}
                  </p>
                )}
                {state.task && (
                  <p className="agent-solar-task">
                    <span>Recent task</span>
                    {state.task}
                  </p>
                )}
                <div className="agent-solar-agent-actions">
                  <button
                    type="button"
                    className="agent-solar-inspect"
                    onClick={() => onInspect(displayedRole.id)}
                  >
                    View agent plans <ArrowUpRight aria-hidden="true" />
                  </button>
                  {(displayedRole.planCount !== null ||
                    displayedRole.prCount !== null) && (
                    <span className="agent-solar-counts">
                      {displayedRole.planCount !== null && (
                        <span>
                          {displayedRole.planCount}{" "}
                          {displayedRole.planCount === 1 ? "plan" : "plans"}
                        </span>
                      )}
                      {displayedRole.prCount !== null && (
                        <span>
                          {displayedRole.prCount}{" "}
                          {displayedRole.prCount === 1 ? "PR" : "PRs"}
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <>
                <span className="agent-solar-kind">Repository overview</span>
                <h3 className="agent-solar-title">
                  One repository. Many worlds.
                </h3>
                <p className="agent-solar-description">
                  {roles.length === 0
                    ? "Scan this repository to discover agent worlds."
                    : "Each world is an agent. Follow its orbit, inspect its work, and open its plans."}
                </p>
              </>
            )}
          </section>
          <p className="agent-solar-navigation-hint">
            {cameraMode === "alien"
              ? "Following the spaceship"
              : "Drag to orbit · Scroll to approach"}
          </p>
        </div>

        <div className="agent-solar-directory">
          <div className="agent-solar-directory-caption">
            <span>
              {roles.length}{" "}
              {roles.length === 1 ? "agent world" : "agent worlds"}
            </span>
            <span
              className="agent-solar-motion"
              data-paused={paused || Boolean(hoveredId)}
            >
              {motionLabel}
            </span>
          </div>
          {roles.length > 0 && (
            <nav
              className="agent-solar-worlds"
              aria-label="Agent worlds"
              onKeyDown={navigateAgents}
            >
              {roles.map((role, index) => {
                const world = WORLD_TEXTURES[index % WORLD_TEXTURES.length];
                const roleStatus = roleState(role, statuses);
                return (
                  <button
                    key={role.id}
                    type="button"
                    className="agent-solar-world"
                    aria-label={`Focus ${role.name}`}
                    aria-pressed={selectedId === role.id}
                    title={`${role.name} · ${roleStatus.label}`}
                    data-hovered={hoveredId === role.id}
                    data-world={world}
                    onClick={() => onSelect(role.id)}
                  >
                    <span
                      className="agent-solar-world-art"
                      aria-hidden="true"
                      style={
                        {
                          "--world-texture": `url("/assets/solar/${world}-color.jpg")`,
                        } as CSSProperties
                      }
                    />
                    <span className="agent-solar-world-copy">
                      <span className="agent-solar-world-name">
                        {role.name}
                      </span>
                      <span
                        className="agent-solar-world-status agent-solar-status"
                        data-status={roleStatus.status}
                      >
                        <roleStatus.Icon aria-hidden="true" />
                        {roleStatus.label}
                      </span>
                    </span>
                  </button>
                );
              })}
            </nav>
          )}
        </div>
      </div>
    </section>
  );
}
