import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  Repository,
  AgentRole,
  AnalysisResult,
  ActivityEvent,
} from "@shared/schema";

interface BHADatabase extends DBSchema {
  repositories: {
    key: string;
    value: Repository;
  };
  agentRoles: {
    key: string;
    value: AgentRole;
    indexes: { "by-repo": string };
  };
  analysisResults: {
    key: string;
    value: AnalysisResult;
    indexes: { "by-repo": string };
  };
  activityEvents: {
    key: string;
    value: ActivityEvent;
    indexes: { "by-repo": string };
  };
}

let dbPromise: Promise<IDBPDatabase<BHADatabase>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<BHADatabase>("bha-command-center", 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore("repositories", { keyPath: "id" });

          const rolesStore = db.createObjectStore("agentRoles", { keyPath: "id" });
          rolesStore.createIndex("by-repo", "repositoryId");

          const analysisStore = db.createObjectStore("analysisResults", { keyPath: "id" });
          analysisStore.createIndex("by-repo", "repositoryId");

          const eventsStore = db.createObjectStore("activityEvents", { keyPath: "id" });
          eventsStore.createIndex("by-repo", "repositoryId");
        }
        if (oldVersion < 2) {
          // Recreate agentRoles store with new schema (files[] instead of promptFile)
          if (db.objectStoreNames.contains("agentRoles")) {
            db.deleteObjectStore("agentRoles");
          }
          const rolesStore = db.createObjectStore("agentRoles", { keyPath: "id" });
          rolesStore.createIndex("by-repo", "repositoryId");
        }
      },
    });
  }
  return dbPromise;
}

function generateId(): string {
  return crypto.randomUUID();
}

export const db = {
  async getRepositories(): Promise<Repository[]> {
    const database = await getDB();
    const repos = await database.getAll("repositories");
    return repos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async getRepository(id: string): Promise<Repository | undefined> {
    const database = await getDB();
    return database.get("repositories", id);
  },

  async createRepository(data: Omit<Repository, "id" | "createdAt" | "lastAnalyzedAt" | "gravityScore" | "totalPrs" | "totalCommits">): Promise<Repository> {
    const database = await getDB();
    const repo: Repository = {
      ...data,
      id: generateId(),
      lastAnalyzedAt: null,
      gravityScore: null,
      totalPrs: null,
      totalCommits: null,
      createdAt: new Date().toISOString(),
    };
    await database.put("repositories", repo);
    return repo;
  },

  async updateRepository(id: string, data: Partial<Repository>): Promise<Repository | undefined> {
    const database = await getDB();
    const existing = await database.get("repositories", id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data };
    await database.put("repositories", updated);
    return updated;
  },

  async deleteRepository(id: string): Promise<void> {
    const database = await getDB();
    await database.delete("repositories", id);
    const tx = database.transaction(["agentRoles", "analysisResults", "activityEvents"], "readwrite");
    const rolesIndex = tx.objectStore("agentRoles").index("by-repo");
    const analysisIndex = tx.objectStore("analysisResults").index("by-repo");
    const eventsIndex = tx.objectStore("activityEvents").index("by-repo");

    for (const role of await rolesIndex.getAll(id)) {
      await tx.objectStore("agentRoles").delete(role.id);
    }
    for (const result of await analysisIndex.getAll(id)) {
      await tx.objectStore("analysisResults").delete(result.id);
    }
    for (const event of await eventsIndex.getAll(id)) {
      await tx.objectStore("activityEvents").delete(event.id);
    }
    await tx.done;
  },

  async getAgentRoles(repositoryId: string): Promise<AgentRole[]> {
    const database = await getDB();
    const roles = await database.getAllFromIndex("agentRoles", "by-repo", repositoryId);
    return roles.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async setAgentRoles(repositoryId: string, roles: Omit<AgentRole, "id" | "repositoryId" | "createdAt" | "planCount" | "prCount" | "lastActiveAt">[]): Promise<AgentRole[]> {
    const database = await getDB();
    const tx = database.transaction("agentRoles", "readwrite");
    const index = tx.store.index("by-repo");
    for (const existing of await index.getAll(repositoryId)) {
      await tx.store.delete(existing.id);
    }
    const created: AgentRole[] = [];
    for (const role of roles) {
      const agentRole: AgentRole = {
        ...role,
        id: generateId(),
        repositoryId,
        planCount: role.files?.filter((f: any) => f.type === "plan").length ?? 0,
        prCount: null,
        lastActiveAt: null,
        createdAt: new Date().toISOString(),
      };
      await tx.store.put(agentRole);
      created.push(agentRole);
    }
    await tx.done;
    return created;
  },

  async getAnalysisResults(repositoryId: string): Promise<AnalysisResult[]> {
    const database = await getDB();
    const results = await database.getAllFromIndex("analysisResults", "by-repo", repositoryId);
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async createAnalysisResult(data: Omit<AnalysisResult, "id" | "createdAt">): Promise<AnalysisResult> {
    const database = await getDB();
    const result: AnalysisResult = {
      ...data,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };
    await database.put("analysisResults", result);
    return result;
  },

  async getActivityEvents(repositoryId: string): Promise<ActivityEvent[]> {
    const database = await getDB();
    const events = await database.getAllFromIndex("activityEvents", "by-repo", repositoryId);
    return events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async setActivityEvents(repositoryId: string, events: Omit<ActivityEvent, "id" | "repositoryId" | "agentRoleId">[]): Promise<ActivityEvent[]> {
    const database = await getDB();
    const tx = database.transaction("activityEvents", "readwrite");
    const index = tx.store.index("by-repo");
    for (const existing of await index.getAll(repositoryId)) {
      await tx.store.delete(existing.id);
    }
    const created: ActivityEvent[] = [];
    for (const event of events) {
      const activityEvent: ActivityEvent = {
        ...event,
        id: generateId(),
        repositoryId,
        agentRoleId: null,
        createdAt: event.createdAt || new Date().toISOString(),
      };
      await tx.store.put(activityEvent);
      created.push(activityEvent);
    }
    await tx.done;
    return created;
  },
};
