import type { AgentRole } from "@shared/schema";

interface GravityVisualizationProps {
  repoName: string;
  roles: AgentRole[];
  className?: string;
}

function getStatusColor(status: string | null): string {
  switch (status) {
    case "active":
      return "hsl(142, 76%, 36%)";
    case "saturated":
      return "hsl(43, 96%, 56%)";
    case "drifting":
      return "hsl(0, 84%, 60%)";
    default:
      return "hsl(258, 90%, 66%)";
  }
}

export function GravityVisualization({
  repoName,
  roles,
  className = "",
}: GravityVisualizationProps) {
  const centerX = 200;
  const centerY = 200;
  const orbitRadius = 120;

  return (
    <div className={`relative ${className}`} data-testid="gravity-visualization">
      <svg
        viewBox="0 0 400 400"
        className="w-full h-full"
        style={{ maxWidth: 400, maxHeight: 400 }}
      >
        <defs>
          <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(258, 90%, 66%)" stopOpacity="0.6" />
            <stop offset="100%" stopColor="hsl(258, 90%, 66%)" stopOpacity="0" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle
          cx={centerX}
          cy={centerY}
          r={orbitRadius + 10}
          fill="none"
          stroke="hsl(258, 90%, 66%)"
          strokeWidth="0.5"
          strokeDasharray="4 4"
          opacity="0.3"
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from={`0 ${centerX} ${centerY}`}
            to={`360 ${centerX} ${centerY}`}
            dur="60s"
            repeatCount="indefinite"
          />
        </circle>

        <circle
          cx={centerX}
          cy={centerY}
          r={orbitRadius - 20}
          fill="none"
          stroke="hsl(258, 90%, 66%)"
          strokeWidth="0.5"
          strokeDasharray="2 6"
          opacity="0.2"
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from={`360 ${centerX} ${centerY}`}
            to={`0 ${centerX} ${centerY}`}
            dur="45s"
            repeatCount="indefinite"
          />
        </circle>

        {roles.map((role, i) => {
          const angle = (i / Math.max(roles.length, 1)) * Math.PI * 2 - Math.PI / 2;
          const x = centerX + Math.cos(angle) * orbitRadius;
          const y = centerY + Math.sin(angle) * orbitRadius;
          const color = getStatusColor(role.status);
          const activityOpacity = Math.min(0.3 + (role.prCount ?? 0) * 0.1, 0.8);

          return (
            <g key={role.id}>
              <line
                x1={centerX}
                y1={centerY}
                x2={x}
                y2={y}
                stroke={color}
                strokeWidth="1"
                opacity={activityOpacity}
              />
              <circle
                cx={x}
                cy={y}
                r={14}
                fill={color}
                opacity="0.15"
              />
              <circle
                cx={x}
                cy={y}
                r={8}
                fill={color}
                filter="url(#glow)"
              />
              <text
                x={x}
                y={y + 24}
                textAnchor="middle"
                fill="hsl(210, 40%, 98%)"
                fontSize="9"
                opacity="0.7"
              >
                {role.name.length > 12 ? role.name.slice(0, 12) + "..." : role.name}
              </text>
            </g>
          );
        })}

        <circle
          cx={centerX}
          cy={centerY}
          r={40}
          fill="url(#centerGlow)"
        >
          <animate
            attributeName="r"
            values="38;42;38"
            dur="3s"
            repeatCount="indefinite"
          />
        </circle>
        <circle
          cx={centerX}
          cy={centerY}
          r={20}
          fill="hsl(258, 90%, 66%)"
          filter="url(#glow)"
        />
        <text
          x={centerX}
          y={centerY + 4}
          textAnchor="middle"
          fill="white"
          fontSize="8"
          fontWeight="bold"
        >
          {repoName.length > 10 ? repoName.slice(0, 10) + "..." : repoName}
        </text>
      </svg>
    </div>
  );
}
