import { useEffect, useState } from "react";

interface GravityRingProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

function getColor(value: number): string {
  if (value > 70) return "hsl(142, 76%, 36%)";
  if (value >= 40) return "hsl(43, 96%, 56%)";
  return "hsl(0, 84%, 60%)";
}

export function GravityRing({
  value,
  size = 80,
  strokeWidth = 6,
  className = "",
}: GravityRingProps) {
  const [animatedValue, setAnimatedValue] = useState(0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (animatedValue / 100) * circumference;
  const color = getColor(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedValue(value);
    }, 100);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      data-testid="gravity-ring"
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/30"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          style={{
            transition: "stroke-dashoffset 1s ease-out",
          }}
        />
      </svg>
      <span
        className="absolute text-sm font-bold"
        style={{ color }}
        data-testid="text-gravity-value"
      >
        {value ?? 0}
      </span>
    </div>
  );
}
