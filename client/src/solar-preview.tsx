import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { GravityVisualization } from "./components/gravity-visualization";
import {
  createPreviewAgentStates,
  createPreviewRoles,
} from "../../tests/solar-fixture";
import "./index.css";

/** Local-only fixture: renders the production component without application data. */
function SolarPreview() {
  const [count, setCount] = useState(6);
  const [firstStatus, setFirstStatus] = useState("active");
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const roles = useMemo(
    () => createPreviewRoles(count, firstStatus),
    [count, firstStatus],
  );
  const states = useMemo(() => createPreviewAgentStates(roles), [roles]);

  return (
    <main className="solar-preview-page">
      <style>{`
      html, body, #root { margin:0; min-width:0; width:100%; min-height:100%; }
      body { background:#070b12; color:#dce3ec; }
      .solar-preview-page { width:100%; min-width:0; padding:18px 24px 24px; font:13px/1.45 system-ui,sans-serif; }
      .solar-preview-heading { margin:0 0 6px; font-size:15px; font-weight:600; }
      .solar-preview-caption { margin:0; color:#8e9aad; font-size:12px; }
      .solar-preview-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:10px 20px; padding:12px 0; }
      .solar-preview-field { display:flex; align-items:center; gap:8px; }
      .solar-preview-field select { min-height:32px; padding:3px 26px 3px 8px; background:#141d2b; border:1px solid #3d4a60; border-radius:5px; color:#e5ebf5; }
      .solar-preview-result { color:#b4c1d3; overflow-wrap:anywhere; }
      .solar-preview-stage { width:100%; height:calc(100dvh - 150px); min-height:580px; overflow:hidden; border:1px solid #253148; border-radius:12px; }
      @media(max-width:600px) {
        .solar-preview-page { padding:12px 8px; }
        .solar-preview-heading { font-size:13px; }
        .solar-preview-caption { font-size:11px; }
        .solar-preview-toolbar { gap:8px 14px; }
        .solar-preview-field { font-size:12px; gap:5px; }
        .solar-preview-field select { max-width:110px; }
        .solar-preview-result { flex-basis:100%; font-size:11px; }
        .solar-preview-stage { height:calc(100dvh - 164px); min-height:600px; border-radius:9px; }
      }
    `}</style>
      <h1 className="solar-preview-heading">
        Local visual preview · synthetic agent data
      </h1>
      <p className="solar-preview-caption">
        Original Black Hole Orchestrator component. Preview controls only; no
        repository data is changed.
      </p>
      <div
        className="solar-preview-toolbar"
        role="group"
        aria-label="Synthetic preview controls"
      >
        <label className="solar-preview-field">
          Agent count
          <select
            aria-label="Agent count"
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
          >
            <option value={0}>0 agents</option>
            <option value={1}>1 agent</option>
            <option value={6}>6 agents</option>
            <option value={12}>12 agents</option>
          </select>
        </label>
        <label className="solar-preview-field">
          Frontend status
          <select
            aria-label="Frontend status"
            value={firstStatus}
            onChange={(event) => setFirstStatus(event.target.value)}
          >
            <option value="active">Active</option>
            <option value="drifting">Drifting</option>
          </select>
        </label>
        <output
          className="solar-preview-result"
          aria-label="Agent callback result"
          role="status"
        >
          {inspectedId
            ? `Inspected role: ${inspectedId}`
            : "No agent inspected"}
        </output>
      </div>
      <div className="solar-preview-stage">
        <GravityVisualization
          repoName="Black Hole Orchestrator"
          roles={roles}
          agentStates={states}
          onAgentClick={setInspectedId}
        />
      </div>
    </main>
  );
}

document.documentElement.classList.add("dark");
createRoot(document.getElementById("root")!).render(<SolarPreview />);
