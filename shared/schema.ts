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

export interface AgentRole {
  id: string;
  repositoryId: string;
  name: string;
  description: string | null;
  promptFile: string | null;
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
