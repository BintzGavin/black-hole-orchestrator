import type { Express } from "express";
import type { Server } from "http";
import { Octokit } from "@octokit/rest";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

function safeErrorMessage(error: any, fallback: string): string {
  const msg = error?.message || "";
  if (msg.includes("environment variable")) return msg;
  if (msg.includes("owner and name")) return msg;
  console.error("Proxy error:", error);
  return fallback;
}

function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 4) return "****";
  return "****" + value.slice(-4);
}

function getEnvSettings() {
  return {
    githubPat: process.env.GITHUB_PAT || null,
    aiProvider: process.env.AI_PROVIDER || "openai",
    aiApiKey: process.env.AI_API_KEY || null,
    aiModel: process.env.AI_MODEL || "gpt-4",
  };
}

function getOctokit(): Octokit {
  const { githubPat } = getEnvSettings();
  if (!githubPat) {
    throw new Error("GITHUB_PAT environment variable is not set");
  }
  return new Octokit({ auth: githubPat });
}

type ClassifiedFile = {
  path: string;
  fileType: "planning-prompt" | "execution-prompt" | "prompt" | "status" | "progress" | "plan" | "governance" | "other";
  agentName: string;
};

function extractLastPage(linkHeader: string | undefined): number | null {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="last"/);
  return match ? parseInt(match[1], 10) : null;
}

async function getTotalCounts(octokit: Octokit, owner: string, name: string): Promise<{ totalCommits: number; totalPrs: number }> {
  let totalCommits = 0;
  let totalPrs = 0;

  try {
    const commitRes = await octokit.rest.repos.listCommits({ owner, repo: name, per_page: 1 });
    const commitLastPage = extractLastPage(commitRes.headers.link);
    totalCommits = commitLastPage ?? commitRes.data.length;
  } catch { /* fallback to 0 */ }

  try {
    const prRes = await octokit.rest.pulls.list({ owner, repo: name, state: "all", per_page: 1 });
    const prLastPage = extractLastPage(prRes.headers.link);
    totalPrs = prLastPage ?? prRes.data.length;
  } catch { /* fallback to 0 */ }

  return { totalCommits, totalPrs };
}

function getAIModel(provider: string, apiKey: string, model: string) {
  switch (provider) {
    case "openai": {
      const openai = createOpenAI({ apiKey });
      return openai(model);
    }
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(model);
    }
    case "google": {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(model);
    }
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/settings", (_req, res) => {
    const env = getEnvSettings();
    res.json({
      githubPat: maskSecret(env.githubPat),
      aiProvider: env.aiProvider,
      aiApiKey: maskSecret(env.aiApiKey),
      aiModel: env.aiModel,
      configured: !!(env.githubPat && env.aiApiKey),
    });
  });

  app.get("/api/settings/test-github", async (_req, res) => {
    try {
      const octokit = getOctokit();
      const { data } = await octokit.rest.users.getAuthenticated();
      res.json({ success: true, username: data.login });
    } catch (error: any) {
      res.status(400).json({ success: false, message: safeErrorMessage(error, "GitHub connection failed. Check your GITHUB_PAT.") });
    }
  });

  app.post("/api/github/file-content", async (req, res) => {
    try {
      const { owner, name, path, branch } = req.body;
      if (!owner || !name || !path) {
        return res.status(400).json({ message: "owner, name, and path are required" });
      }
      const octokit = getOctokit();
      const { data } = await octokit.rest.repos.getContent({
        owner,
        repo: name,
        path,
        ref: branch || "main",
      });
      if ("content" in data && data.content) {
        const content = Buffer.from(data.content, "base64").toString("utf-8");
        res.json({ content, path: data.path, size: data.size });
      } else {
        res.status(400).json({ message: "Not a file or content unavailable" });
      }
    } catch (error: any) {
      res.status(500).json({ message: safeErrorMessage(error, "Failed to fetch file content.") });
    }
  });

  app.get("/api/settings/test-ai", async (_req, res) => {
    try {
      const env = getEnvSettings();
      if (!env.aiProvider || !env.aiApiKey || !env.aiModel) {
        throw new Error("AI_PROVIDER, AI_API_KEY, and AI_MODEL environment variables must be set");
      }
      const model = getAIModel(env.aiProvider, env.aiApiKey, env.aiModel);
      const { text } = await generateText({
        model,
        prompt: "Hello, respond with OK",
      });
      res.json({ success: true, response: text });
    } catch (error: any) {
      res.status(400).json({ success: false, message: safeErrorMessage(error, "AI connection failed. Check your AI_API_KEY and AI_PROVIDER.") });
    }
  });

  app.post("/api/github/repo", async (req, res) => {
    try {
      const { owner, name } = req.body;
      if (!owner || !name) {
        return res.status(400).json({ message: "owner and name are required" });
      }
      const octokit = getOctokit();
      const { data } = await octokit.rest.repos.get({ owner, repo: name });
      res.json({
        owner: data.owner.login,
        name: data.name,
        fullName: data.full_name,
        description: data.description || null,
        defaultBranch: data.default_branch,
      });
    } catch (error: any) {
      res.status(500).json({ message: safeErrorMessage(error, "Failed to fetch repository from GitHub.") });
    }
  });

  app.post("/api/github/counts", async (req, res) => {
    try {
      const { owner, name, since } = req.body;
      if (!owner || !name) {
        return res.status(400).json({ message: "owner and name are required" });
      }
      const octokit = getOctokit();

      let totalCommits = 0;
      let totalPrs = 0;

      // Commits: use listCommits with per_page=1 + Link header for count
      try {
        const commitParams: any = { owner, repo: name, per_page: 1 };
        if (since) commitParams.since = since;
        const commitRes = await octokit.rest.repos.listCommits(commitParams);
        const commitLastPage = extractLastPage(commitRes.headers.link);
        totalCommits = commitLastPage ?? commitRes.data.length;
      } catch { /* fallback to 0 */ }

      // PRs: use search API when filtering by date; pulls.list for all-time
      try {
        if (since) {
          const sinceDate = since.split("T")[0]; // YYYY-MM-DD
          const q = `repo:${owner}/${name} is:pr created:>=${sinceDate}`;
          const searchRes = await octokit.rest.search.issuesAndPullRequests({ q, per_page: 1 });
          totalPrs = searchRes.data.total_count;
        } else {
          const prRes = await octokit.rest.pulls.list({ owner, repo: name, state: "all", per_page: 1 });
          const prLastPage = extractLastPage(prRes.headers.link);
          totalPrs = prLastPage ?? prRes.data.length;
        }
      } catch { /* fallback to 0 */ }

      res.json({ totalCommits, totalPrs });
    } catch (error: any) {
      res.status(500).json({ message: safeErrorMessage(error, "Failed to fetch counts.") });
    }
  });

  app.post("/api/github/scan", async (req, res) => {
    try {
      const { owner, name, defaultBranch } = req.body;
      if (!owner || !name) {
        return res.status(400).json({ message: "owner and name are required" });
      }
      const octokit = getOctokit();
      const branch = defaultBranch || "main";

      let tree: any[] = [];
      try {
        const { data } = await octokit.rest.git.getTree({
          owner,
          repo: name,
          tree_sha: branch,
          recursive: "1",
        });
        tree = data.tree;
      } catch (e: any) {
        return res.status(400).json({ message: "Failed to fetch repo tree: " + e.message });
      }

      // ---- Pass 1: classify every relevant file and extract its base agent name ----
      const classified: ClassifiedFile[] = [];

      const patterns: { regex: RegExp; fileType: ClassifiedFile["fileType"]; nameIndex: number; nameTransform?: (n: string) => string; fixedAgent?: string }[] = [
        // Domain agent prompt pairs
        { regex: /^docs\/prompts\/planning-([^/]+)\.md$/i, fileType: "planning-prompt", nameIndex: 1, nameTransform: (n) => n.toUpperCase() },
        { regex: /^docs\/prompts\/execution-([^/]+)\.md$/i, fileType: "execution-prompt", nameIndex: 1, nameTransform: (n) => n.toUpperCase() },
        // Daily agent single prompts (exclude README and planning-*/execution-* which matched above)
        { regex: /^docs\/prompts\/(?!planning-|execution-|README)([^/]+)\.md$/i, fileType: "prompt", nameIndex: 1, nameTransform: (n) => n.toUpperCase() },
        // Status files
        { regex: /^docs\/status\/([^/]+)\.md$/i, fileType: "status", nameIndex: 1, nameTransform: (n) => n.toUpperCase() },
        // Progress logs
        { regex: /^docs\/PROGRESS-([^/]+)\.md$/i, fileType: "progress", nameIndex: 1, nameTransform: (n) => n.toUpperCase() },
        // Plans in agent-named subdirectories: .sys/plans/{agent}/...
        { regex: /^\.sys\/plans\/([^/]+)\/.+$/i, fileType: "plan", nameIndex: 1, nameTransform: (n) => n.toUpperCase() },
        // Shared governance files
        { regex: /^AGENTS\.md$/i, fileType: "governance", nameIndex: -1, fixedAgent: "_SHARED" },
        { regex: /^CLAUDE\.md$/i, fileType: "governance", nameIndex: -1, fixedAgent: "_SHARED" },
        // .github/agents
        { regex: /^\.github\/agents\/.+$/i, fileType: "other", nameIndex: -1, fixedAgent: "_SHARED" },
      ];

      for (const item of tree) {
        if (item.type !== "blob") continue;
        const p = item.path as string;

        for (const pat of patterns) {
          const m = p.match(pat.regex);
          if (m) {
            const agentName = pat.fixedAgent ?? (pat.nameTransform ? pat.nameTransform(m[pat.nameIndex]) : m[pat.nameIndex]);
            classified.push({ path: p, fileType: pat.fileType, agentName });
            break; // first match wins
          }
        }
      }

      // For loose plan files like .sys/plans/2026-10-29-PLAYER-Async-Seek.md,
      // try to attribute to a known agent by checking if agent name appears in filename
      const knownAgents = new Set(classified.map((f) => f.agentName).filter((n) => n !== "_SHARED"));

      for (const item of tree) {
        if (item.type !== "blob") continue;
        const p = item.path as string;
        // Only match files directly in .sys/plans/ (not subdirectories, which are already classified)
        if (!/^\.sys\/plans\/[^/]+\.md$/i.test(p)) continue;
        // Skip if already classified
        if (classified.some((c) => c.path === p)) continue;

        const fileName = p.split("/").pop() || "";
        const upperFileName = fileName.toUpperCase();
        for (const agent of knownAgents) {
          if (upperFileName.includes(agent)) {
            classified.push({ path: p, fileType: "plan", agentName: agent });
            break;
          }
        }
      }

      // ---- Pass 2: group by agent name and build consolidated roles ----
      const agentMap = new Map<string, ClassifiedFile[]>();
      for (const cf of classified) {
        const existing = agentMap.get(cf.agentName) || [];
        existing.push(cf);
        agentMap.set(cf.agentName, existing);
      }

      // Fetch content for description & boundary extraction
      // Use a cache to avoid fetching the same file twice, and parallelize all fetches
      const contentCache = new Map<string, string>();

      async function fetchContent(filePath: string): Promise<string | null> {
        if (contentCache.has(filePath)) return contentCache.get(filePath)!;
        try {
          const { data } = await octokit.rest.repos.getContent({
            owner, repo: name, path: filePath, ref: branch,
          });
          if ("content" in data && data.content) {
            const content = Buffer.from(data.content, "base64").toString("utf-8");
            contentCache.set(filePath, content);
            return content;
          }
        } catch { /* skip */ }
        return null;
      }

      // Collect which files each agent needs fetched
      type AgentWork = {
        agentName: string;
        files: ClassifiedFile[];
        descPath: string | null;
        boundaryPath: string | null;
      };

      const workItems: AgentWork[] = [];
      for (const [agentName, files] of agentMap) {
        const descFile = files.find((f) => f.fileType === "status")
          || files.find((f) => f.fileType === "planning-prompt")
          || files.find((f) => f.fileType === "prompt")
          || files[0];

        const boundaryFile = files.find((f) => f.fileType === "planning-prompt")
          || files.find((f) => f.fileType === "execution-prompt")
          || files.find((f) => f.fileType === "prompt");

        workItems.push({
          agentName,
          files,
          descPath: descFile?.path ?? null,
          boundaryPath: boundaryFile?.path ?? null,
        });
      }

      // Deduplicate paths and fetch all in parallel
      const uniquePaths = new Set<string>();
      for (const w of workItems) {
        if (w.descPath) uniquePaths.add(w.descPath);
        if (w.boundaryPath) uniquePaths.add(w.boundaryPath);
      }
      await Promise.all(Array.from(uniquePaths).map((p) => fetchContent(p)));

      // Now build roles from cached content (no more API calls)
      const roles = [];
      for (const { agentName, files, descPath, boundaryPath } of workItems) {
        const hasPlanning = files.some((f) => f.fileType === "planning-prompt");
        const hasExecution = files.some((f) => f.fileType === "execution-prompt");
        const category = agentName === "_SHARED" ? "shared" as const : (hasPlanning || hasExecution) ? "domain" as const : "daily" as const;

        let description: string | null = null;
        if (descPath) {
          const content = contentCache.get(descPath);
          if (content) {
            description = content.split("\n").slice(0, 5).join("\n").trim() || `Agent: ${agentName}`;
          }
        }

        let boundaries: string[] | null = null;
        if (boundaryPath) {
          const content = contentCache.get(boundaryPath);
          if (content) {
            const boundaryMatch = content.match(/## Boundaries\n([\s\S]*?)(?=\n##|\n$|$)/i);
            if (boundaryMatch) {
              boundaries = boundaryMatch[1].split("\n").filter((l: string) => l.trim().startsWith("-")).map((l: string) => l.replace(/^-\s*/, "").trim());
            }
          }
        }

        const displayName = agentName === "_SHARED" ? "SHARED" : agentName;

        roles.push({
          name: displayName,
          description,
          files: files.map((f) => ({ path: f.path, type: f.fileType })),
          category,
          boundaries: boundaries && boundaries.length > 0 ? boundaries : null,
          status: "active",
        });
      }

      res.json(roles);
    } catch (error: any) {
      res.status(500).json({ message: safeErrorMessage(error, "Failed to scan repository.") });
    }
  });

  app.post("/api/github/analyze", async (req, res) => {
    try {
      const { owner, name } = req.body;
      if (!owner || !name) {
        return res.status(400).json({ message: "owner and name are required" });
      }

      const env = getEnvSettings();
      if (!env.githubPat) {
        return res.status(400).json({ message: "GITHUB_PAT environment variable is not set" });
      }
      if (!env.aiProvider || !env.aiApiKey || !env.aiModel) {
        return res.status(400).json({ message: "AI_PROVIDER, AI_API_KEY, and AI_MODEL environment variables must be set" });
      }

      const octokit = new Octokit({ auth: env.githubPat });

      // Get real totals via Link header pagination (not capped by per_page)
      const { totalCommits: realTotalCommits, totalPrs: realTotalPrs } = await getTotalCounts(octokit, owner, name);

      const { data: commits } = await octokit.rest.repos.listCommits({
        owner,
        repo: name,
        per_page: 100,
      });

      const { data: prs } = await octokit.rest.pulls.list({
        owner,
        repo: name,
        state: "all",
        per_page: 50,
        sort: "updated",
        direction: "desc",
      });

      const activityEvents = [];

      for (const commit of commits) {
        activityEvents.push({
          type: "commit",
          title: commit.commit.message.split("\n")[0],
          description: commit.commit.message,
          sha: commit.sha,
          author: commit.commit.author?.name || commit.author?.login || "unknown",
          additions: commit.stats?.additions || 0,
          deletions: commit.stats?.deletions || 0,
          filesChanged: commit.files?.length || 0,
        });
      }

      for (const pr of prs) {
        activityEvents.push({
          type: "pull_request",
          title: pr.title,
          description: pr.body || "",
          prNumber: pr.number,
          author: pr.user?.login || "unknown",
          additions: (pr as any).additions || 0,
          deletions: (pr as any).deletions || 0,
          filesChanged: (pr as any).changed_files || 0,
        });
      }

      const commitSummary = commits.slice(0, 20).map((c) => `- ${c.commit.message.split("\n")[0]} (by ${c.commit.author?.name || "unknown"})`).join("\n");
      const prSummary = prs.slice(0, 10).map((p) => `- PR #${p.number}: ${p.title} (${p.state}) by ${p.user?.login || "unknown"}`).join("\n");

      const prompt = `Analyze the following git activity for the repository "${owner}/${name}", which operates using the Black Hole Architecture.

1. First line must exactly be: GRAVITY_SCORE: <number 0-100> (where 100 means very strong momentum towards the Vision).
2. The rest of the response should be a rich Markdown-formatted analysis. Use Markdown features aggressively to make it readable:
   - Use headers (## System Convergence, ## Thrashing/Friction, ## Recommendations)
   - Use bullet points for lists
   - Use **bold** text and \`code blocks\` for emphasis

IMPORTANT CONTEXT:
Do not explain the Black Hole Architecture to the user—they already know about Jules, temporal scheduling, strict role separation (planners vs executors), file ownership, memory files, and the Vision constraint model. 

Instead, apply this knowledge to evaluate the actual git activity. Focus your analysis on what matters in this specific architecture:
- Are planners emitting tight, actionable specs?
- Are executors staying within their boundaries and successfully merging changes?
- Is the system converging towards the vision, or are agents thrashing on specific files?
- Are there any gaps between the observed execution and the ideal Black Hole principles?
- Identify any "weak signals" (e.g., recurring failures, memory file churn) and provide actionable recommendations.

Recent Commits (last ${commits.length}):
${commitSummary}

Recent Pull Requests (last ${prs.length}):
${prSummary}

Total commits fetched: ${commits.length}
Total PRs fetched: ${prs.length}`;

      const model = getAIModel(env.aiProvider, env.aiApiKey, env.aiModel);
      const { text } = await generateText({ model, prompt });

      let gravityScore = 50;
      const scoreMatch = text.match(/GRAVITY_SCORE:\s*(\d+)/i);
      if (scoreMatch) {
        gravityScore = Math.min(100, Math.max(0, parseInt(scoreMatch[1], 10)));
      }

      // The summary is everything after the gravity score line
      let summary = text.replace(/GRAVITY_SCORE:\s*\d+/i, "").trim();

      res.json({
        gravityScore,
        summary,
        fullResponse: text,
        commitsAnalyzed: realTotalCommits,
        prsAnalyzed: realTotalPrs,
        activityEvents,
      });
    } catch (error: any) {
      res.status(500).json({ message: safeErrorMessage(error, "Analysis failed.") });
    }
  });

  return httpServer;
}
