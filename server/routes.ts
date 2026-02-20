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

      const rolePaths: { path: string; type: string }[] = [];
      for (const item of tree) {
        if (item.type !== "blob") continue;
        const p = item.path as string;
        if (p.startsWith("docs/prompts/")) {
          rolePaths.push({ path: p, type: "prompt" });
        } else if (p.startsWith(".github/agents/")) {
          rolePaths.push({ path: p, type: "agent" });
        } else if (p === "AGENTS.md") {
          rolePaths.push({ path: p, type: "agents-md" });
        } else if (p === "CLAUDE.md") {
          rolePaths.push({ path: p, type: "claude-md" });
        } else if (p.startsWith(".sys/plans/")) {
          rolePaths.push({ path: p, type: "plan" });
        }
      }

      const roles = [];
      for (const rp of rolePaths) {
        let content = "";
        try {
          const { data } = await octokit.rest.repos.getContent({
            owner,
            repo: name,
            path: rp.path,
            ref: branch,
          });
          if ("content" in data && data.content) {
            content = Buffer.from(data.content, "base64").toString("utf-8");
          }
        } catch {
          continue;
        }

        const fileName = rp.path.split("/").pop() || rp.path;
        const roleName = fileName.replace(/\.(md|txt|yaml|yml|json)$/i, "");
        const lines = content.split("\n");
        const description = lines.slice(0, 5).join("\n").trim() || `Role from ${rp.path}`;

        const boundaries: string[] = [];
        const boundaryMatch = content.match(/## Boundaries\n([\s\S]*?)(?=\n##|\n$|$)/i);
        if (boundaryMatch) {
          const boundaryLines = boundaryMatch[1].split("\n").filter((l: string) => l.trim().startsWith("-"));
          for (const bl of boundaryLines) {
            boundaries.push(bl.replace(/^-\s*/, "").trim());
          }
        }

        roles.push({
          name: roleName,
          description,
          promptFile: rp.path,
          boundaries: boundaries.length > 0 ? boundaries : null,
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

      const prompt = `Analyze the following git activity for the repository "${owner}/${name}" and provide:
1. An overall "gravity score" from 0-100 (where 100 means the project has very strong development momentum and activity)
2. A summary of recent accomplishments
3. Detection of any weak gravity signals (areas where development has slowed or stopped)
4. Recommendations for improvement

Recent Commits (last ${commits.length}):
${commitSummary}

Recent Pull Requests (last ${prs.length}):
${prSummary}

Total commits fetched: ${commits.length}
Total PRs fetched: ${prs.length}

Respond in this exact format:
GRAVITY_SCORE: <number>
SUMMARY: <your analysis summary in a single paragraph>
WEAK_SIGNALS: <detected weak signals>
RECOMMENDATIONS: <your recommendations>`;

      const model = getAIModel(env.aiProvider, env.aiApiKey, env.aiModel);
      const { text } = await generateText({ model, prompt });

      let gravityScore = 50;
      const scoreMatch = text.match(/GRAVITY_SCORE:\s*(\d+)/);
      if (scoreMatch) {
        gravityScore = Math.min(100, Math.max(0, parseInt(scoreMatch[1], 10)));
      }

      let summary = text;
      const summaryMatch = text.match(/SUMMARY:\s*([\s\S]*?)(?=WEAK_SIGNALS:|$)/);
      if (summaryMatch) {
        summary = summaryMatch[1].trim();
      }

      res.json({
        gravityScore,
        summary,
        fullResponse: text,
        commitsAnalyzed: commits.length,
        prsAnalyzed: prs.length,
        activityEvents,
      });
    } catch (error: any) {
      res.status(500).json({ message: safeErrorMessage(error, "Analysis failed.") });
    }
  });

  return httpServer;
}
