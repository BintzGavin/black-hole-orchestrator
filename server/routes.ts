import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { Octokit } from "@octokit/rest";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 4) return "****";
  return "****" + value.slice(-4);
}

async function getOctokit(): Promise<Octokit> {
  const settings = await storage.getSettings();
  if (!settings?.githubPat) {
    throw new Error("GitHub PAT is not configured");
  }
  return new Octokit({ auth: settings.githubPat });
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

  app.get("/api/settings", async (_req, res) => {
    try {
      const settings = await storage.getSettings();
      if (!settings) {
        return res.json(null);
      }
      res.json({
        ...settings,
        githubPat: maskSecret(settings.githubPat),
        aiApiKey: maskSecret(settings.aiApiKey),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/settings", async (req, res) => {
    try {
      const { githubPat, aiProvider, aiApiKey, aiModel } = req.body;
      const data: any = {};
      if (githubPat !== undefined) data.githubPat = githubPat;
      if (aiProvider !== undefined) data.aiProvider = aiProvider;
      if (aiApiKey !== undefined) data.aiApiKey = aiApiKey;
      if (aiModel !== undefined) data.aiModel = aiModel;
      const settings = await storage.upsertSettings(data);
      res.json({
        ...settings,
        githubPat: maskSecret(settings.githubPat),
        aiApiKey: maskSecret(settings.aiApiKey),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/settings/test-github", async (_req, res) => {
    try {
      const octokit = await getOctokit();
      const { data } = await octokit.rest.users.getAuthenticated();
      res.json({ success: true, username: data.login });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  });

  app.get("/api/settings/test-ai", async (_req, res) => {
    try {
      const settings = await storage.getSettings();
      if (!settings?.aiProvider || !settings?.aiApiKey || !settings?.aiModel) {
        throw new Error("AI provider settings are not configured");
      }
      const model = getAIModel(settings.aiProvider, settings.aiApiKey, settings.aiModel);
      const { text } = await generateText({
        model,
        prompt: "Hello, respond with OK",
      });
      res.json({ success: true, response: text });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  });

  app.get("/api/repositories", async (_req, res) => {
    try {
      const repos = await storage.getRepositories();
      res.json(repos);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/repositories", async (req, res) => {
    try {
      const { owner, name } = req.body;
      if (!owner || !name) {
        return res.status(400).json({ message: "owner and name are required" });
      }
      const octokit = await getOctokit();
      const { data } = await octokit.rest.repos.get({ owner, repo: name });
      const repo = await storage.createRepository({
        owner: data.owner.login,
        name: data.name,
        fullName: data.full_name,
        description: data.description || null,
        defaultBranch: data.default_branch,
      });
      res.status(201).json(repo);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/repositories/:id", async (req, res) => {
    try {
      const repo = await storage.getRepository(req.params.id);
      if (!repo) {
        return res.status(404).json({ message: "Repository not found" });
      }
      res.json(repo);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/repositories/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const repo = await storage.getRepository(id);
      if (!repo) {
        return res.status(404).json({ message: "Repository not found" });
      }
      await storage.deleteAgentRolesByRepository(id);
      await storage.deleteRepository(id);
      res.json({ message: "Repository deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/repositories/:id/scan", async (req, res) => {
    try {
      const id = req.params.id;
      const repo = await storage.getRepository(id);
      if (!repo) {
        return res.status(404).json({ message: "Repository not found" });
      }
      const octokit = await getOctokit();

      let tree: any[] = [];
      try {
        const { data } = await octokit.rest.git.getTree({
          owner: repo.owner,
          repo: repo.name,
          tree_sha: repo.defaultBranch || "main",
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

      await storage.deleteAgentRolesByRepository(id);

      const roles = [];
      for (const rp of rolePaths) {
        let content = "";
        try {
          const { data } = await octokit.rest.repos.getContent({
            owner: repo.owner,
            repo: repo.name,
            path: rp.path,
            ref: repo.defaultBranch || "main",
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

        const role = await storage.createAgentRole({
          repositoryId: id,
          name: roleName,
          description,
          promptFile: rp.path,
          boundaries: boundaries.length > 0 ? boundaries : null,
          status: "active",
        });
        roles.push(role);
      }

      res.json(roles);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/repositories/:id/analyze", async (req, res) => {
    try {
      const id = req.params.id;
      const repo = await storage.getRepository(id);
      if (!repo) {
        return res.status(404).json({ message: "Repository not found" });
      }

      const settings = await storage.getSettings();
      if (!settings?.githubPat) {
        return res.status(400).json({ message: "GitHub PAT is not configured" });
      }
      if (!settings?.aiProvider || !settings?.aiApiKey || !settings?.aiModel) {
        return res.status(400).json({ message: "AI provider settings are not configured" });
      }

      const octokit = new Octokit({ auth: settings.githubPat });

      const { data: commits } = await octokit.rest.repos.listCommits({
        owner: repo.owner,
        repo: repo.name,
        per_page: 100,
      });

      const { data: prs } = await octokit.rest.pulls.list({
        owner: repo.owner,
        repo: repo.name,
        state: "all",
        per_page: 50,
        sort: "updated",
        direction: "desc",
      });

      for (const commit of commits) {
        await storage.createActivityEvent({
          repositoryId: id,
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
        await storage.createActivityEvent({
          repositoryId: id,
          type: "pull_request",
          title: pr.title,
          description: pr.body || "",
          prNumber: pr.number,
          author: pr.user?.login || "unknown",
          additions: pr.additions || 0,
          deletions: pr.deletions || 0,
          filesChanged: pr.changed_files || 0,
        });
      }

      const commitSummary = commits.slice(0, 20).map((c) => `- ${c.commit.message.split("\n")[0]} (by ${c.commit.author?.name || "unknown"})`).join("\n");
      const prSummary = prs.slice(0, 10).map((p) => `- PR #${p.number}: ${p.title} (${p.state}) by ${p.user?.login || "unknown"}`).join("\n");

      const prompt = `Analyze the following git activity for the repository "${repo.fullName}" and provide:
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

      const model = getAIModel(settings.aiProvider, settings.aiApiKey, settings.aiModel);
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

      const analysis = await storage.createAnalysisResult({
        repositoryId: id,
        type: "ai_analysis",
        summary,
        score: gravityScore,
        details: { fullResponse: text, commitsAnalyzed: commits.length, prsAnalyzed: prs.length },
      });

      await storage.updateRepository(id, {
        gravityScore,
        lastAnalyzedAt: new Date(),
        totalCommits: commits.length,
        totalPrs: prs.length,
      });

      res.json(analysis);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/repositories/:id/roles", async (req, res) => {
    try {
      const roles = await storage.getAgentRoles(req.params.id);
      res.json(roles);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/repositories/:id/activity", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const events = await storage.getActivityEvents(req.params.id, limit);
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/repositories/:id/analysis", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const results = await storage.getAnalysisResults(req.params.id, limit);
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
