import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentRole } from "@shared/schema";
import { AgentUniverse } from "./solar/agent-universe";
import { SolarControls } from "./solar/solar-controls";
import { createAgentWorlds, type AgentState } from "./solar/layout";
import "./solar/solar-scene.css";

interface GravityVisualizationProps {
  repoName: string;
  roles: AgentRole[];
  agentStates?: AgentState[];
  className?: string;
  onAgentClick?: (roleId: string) => void;
}

export function GravityVisualization({
  repoName,
  roles,
  agentStates,
  className = "",
  onAgentClick,
}: GravityVisualizationProps) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const universe = useRef<AgentUniverse | null>(null);
  const latestClick = useRef(onAgentClick);
  latestClick.current = onAgentClick;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pauseOverride, setPauseOverride] = useState<boolean | null>(null);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [cameraMode, setCameraMode] = useState<"orbit" | "alien">("orbit");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const paused = pauseOverride ?? reducedMotion;
  const effectivePause = paused || hoveredId !== null;
  const worlds = useMemo(
    () => createAgentWorlds(roles, agentStates ?? []),
    [roles, agentStates],
  );
  const statuses = useMemo(
    () =>
      Object.fromEntries(
        worlds.map((world) => [
          world.id,
          { status: world.status, task: world.task },
        ]),
      ),
    [worlds],
  );

  const inspectAgent = async (id: string) => {
    // The original plan sheet portals into document.body, outside the scene.
    if (document.fullscreenElement === host.current) {
      try {
        await document.exitFullscreen();
      } catch {
        setError("Exit fullscreen to open this agent’s plans.");
        return;
      }
    }
    latestClick.current?.(id);
  };

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReducedMotion(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);

  useEffect(() => {
    if (!host.current || !canvas.current) return;
    const surface = canvas.current;
    let engine: AgentUniverse;
    let disposed = false;
    try {
      engine = new AgentUniverse(surface, host.current, {
        onInspect: (id) => {
          setSelectedId(id);
          setCameraMode("orbit");
          engine.focus(id);
          void inspectAgent(id);
        },
        onHover: setHoveredId,
        onReady: () => {
          if (!disposed) setLoading(false);
        },
        onError: (message) => {
          if (!disposed) {
            setLoading(false);
            setError(message);
          }
        },
        onCameraMode: setCameraMode,
      });
    } catch {
      setLoading(false);
      setError(
        "3D rendering is unavailable in this browser. You can still choose an agent below to open its plans.",
      );
      return;
    }
    universe.current = engine;
    const resize = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) engine.resize(rect.width, rect.height);
    });
    resize.observe(host.current);
    let visible = true;
    const visibility = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true;
      },
      { rootMargin: "100px" },
    );
    visibility.observe(host.current);
    let previous = performance.now(),
      frame = 0;
    const animate = (time: number) => {
      if (disposed) return;
      const delta = Math.min(0.1, Math.max(0, (time - previous) / 1000));
      previous = time;
      if (visible && !document.hidden) engine.frame(delta);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    const events = new AbortController();
    const options = { signal: events.signal };
    surface.addEventListener(
      "pointerdown",
      (event) => engine.pointerDown(event),
      options,
    );
    surface.addEventListener(
      "pointermove",
      (event) => engine.pointerMove(event),
      options,
    );
    surface.addEventListener(
      "pointerup",
      (event) => engine.pointerUp(event),
      options,
    );
    surface.addEventListener(
      "pointercancel",
      (event) => engine.pointerCancel(event),
      options,
    );
    surface.addEventListener(
      "pointerleave",
      () => engine.pointerLeave(),
      options,
    );
    surface.addEventListener("wheel", (event) => engine.wheel(event), {
      ...options,
      passive: false,
    });
    surface.addEventListener(
      "contextmenu",
      (event) => event.preventDefault(),
      options,
    );
    surface.addEventListener(
      "webglcontextlost",
      (event) => {
        event.preventDefault();
        setError(
          "Graphics were interrupted. Waiting for the renderer to recover.",
        );
      },
      options,
    );
    surface.addEventListener(
      "webglcontextrestored",
      () => setError(null),
      options,
    );
    document.addEventListener(
      "fullscreenchange",
      () => setFullscreen(document.fullscreenElement === host.current),
      options,
    );
    return () => {
      disposed = true;
      events.abort();
      cancelAnimationFrame(frame);
      resize.disconnect();
      visibility.disconnect();
      engine.dispose();
      universe.current = null;
    };
  }, []);

  useEffect(() => {
    universe.current?.setData(roles, agentStates ?? []);
    if (selectedId && !roles.some((role) => role.id === selectedId))
      setSelectedId(null);
    if (hoveredId && !roles.some((role) => role.id === hoveredId))
      setHoveredId(null);
  }, [roles, agentStates]);
  useEffect(() => {
    universe.current?.setMotion(effectivePause, reducedMotion);
  }, [effectivePause, reducedMotion]);

  const focus = (id: string) => {
    setSelectedId(id);
    setCameraMode("orbit");
    setHoveredId(null);
    universe.current?.focus(id);
  };
  const reset = () => {
    setSelectedId(null);
    setCameraMode("orbit");
    setHoveredId(null);
    universe.current?.reset();
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await host.current?.requestFullscreen();
    } catch {
      setError(
        "Fullscreen is unavailable here. You can still orbit and zoom in this view.",
      );
    }
  };

  return (
    <div
      ref={host}
      className={`agent-solar-system relative w-full h-full ${className}`}
      data-testid="gravity-visualization"
      onKeyDown={(event) => {
        if (
          event.target instanceof HTMLButtonElement ||
          event.target instanceof HTMLInputElement
        )
          return;
        if (event.key === " ") {
          event.preventDefault();
          setPauseOverride(!paused);
        }
        if (event.key === "Escape") reset();
      }}
    >
      <canvas
        ref={canvas}
        aria-label={`${repoName} agent solar system`}
        tabIndex={0}
      />
      <SolarControls
        repoName={repoName}
        roles={roles}
        selectedId={selectedId}
        hoveredId={hoveredId}
        statuses={statuses}
        paused={paused}
        reducedMotion={reducedMotion}
        cameraMode={cameraMode}
        loading={loading}
        error={error}
        onSelect={focus}
        onInspect={(id) => void inspectAgent(id)}
        onReset={reset}
        onPause={() => setPauseOverride(!paused)}
        onCameraMode={(mode) => {
          setCameraMode(mode);
          setSelectedId(null);
          setHoveredId(null);
          setError(null);
          universe.current?.setCameraMode(mode);
        }}
        onFullscreen={() => void toggleFullscreen()}
        fullscreen={fullscreen}
      />
    </div>
  );
}
