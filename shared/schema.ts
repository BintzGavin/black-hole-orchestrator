import { z } from "zod";

export const highFidelityAnalysisSchema = z.object({
  gravityScore: z.number().min(0).max(100),
  executiveSummary: z.string(),
  metrics: z.object({
    totalCommits: z.number(),
    totalPRs: z.number(),
    activeAgents: z.number(),
    focusArea: z.string(),
  }),
  significantProgress: z.array(z.object({
    description: z.string(),
    actor: z.enum(["planner", "executor", "human"]),
    link: z.string().optional(),
  })),
  frictionAndThrashing: z.array(z.object({
    component: z.string(),
    issue: z.string(),
    severity: z.enum(["low", "medium", "critical"]),
    suspectedCause: z.string(),
  })),
  boundaryViolations: z.array(z.object({
    agentOrRole: z.string(),
    violation: z.string(),
    evidence: z.string(),
  })),
  orchestratorActions: z.array(z.object({
    action: z.string(),
    reason: z.string(),
    urgency: z.enum(["do-now", "monitor", "ignore"]),
  })),
  agentStates: z.array(z.object({
    agentName: z.string(),
    currentStatus: z.enum(["active", "idle", "stuck", "divergent", "saturated", "drifting", "unknown"]),
    recentTask: z.string(),
  })),
});

export type HighFidelityAnalysis = z.infer<typeof highFidelityAnalysisSchema>;

export interface Settings {
  githubPat: string | null;
  aiProvider: string | null;
  aiApiKey: string | null;
  aiModel: string | null;
  configured: boolean;
}

export interface Repository {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  defaultBranch: string | null;
  lastAnalyzedAt: string | null;
  gravityScore: number | null;
  totalPrs: number | null;
  totalCommits: number | null;
  createdAt: string;
}

export interface AgentFile {
  path: string;
  type: "planning-prompt" | "execution-prompt" | "prompt" | "status" | "progress" | "plan" | "governance" | "other";
  date?: string | null;
}

export interface AgentRole {
  id: string;
  repositoryId: string;
  name: string;
  description: string | null;
  files: AgentFile[];
  category: "domain" | "daily" | "shared";
  boundaries: string[] | null;
  status: string | null;
  planCount: number | null;
  prCount: number | null;
  lastActiveAt: string | null;
  createdAt: string;
}

export interface AnalysisResult {
  id: string;
  repositoryId: string;
  type: string;
  summary: string;
  details: Record<string, any> | null;
  score: number | null;
  createdAt: string;
}

export interface ActivityEvent {
  id: string;
  repositoryId: string;
  agentRoleId: string | null;
  type: string;
  title: string;
  description: string | null;
  sha: string | null;
  prNumber: number | null;
  author: string | null;
  filesChanged: number | null;
  additions: number | null;
  deletions: number | null;
  createdAt: string;
}
