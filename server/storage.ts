import {
  type Settings,
  type InsertSettings,
  type Repository,
  type InsertRepository,
  type AgentRole,
  type InsertAgentRole,
  type AnalysisResult,
  type InsertAnalysisResult,
  type ActivityEvent,
  type InsertActivityEvent,
  settings,
  repositories,
  agentRoles,
  analysisResults,
  activityEvents,
} from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export interface IStorage {
  getSettings(): Promise<Settings | undefined>;
  upsertSettings(data: InsertSettings): Promise<Settings>;

  getRepositories(): Promise<Repository[]>;
  getRepository(id: string): Promise<Repository | undefined>;
  createRepository(repo: InsertRepository): Promise<Repository>;
  updateRepository(id: string, data: Partial<InsertRepository>): Promise<Repository | undefined>;
  deleteRepository(id: string): Promise<void>;

  getAgentRoles(repositoryId: string): Promise<AgentRole[]>;
  createAgentRole(role: InsertAgentRole): Promise<AgentRole>;
  updateAgentRole(id: string, data: Partial<InsertAgentRole>): Promise<AgentRole | undefined>;
  deleteAgentRolesByRepository(repositoryId: string): Promise<void>;

  getAnalysisResults(repositoryId: string, limit?: number): Promise<AnalysisResult[]>;
  createAnalysisResult(result: InsertAnalysisResult): Promise<AnalysisResult>;

  getActivityEvents(repositoryId: string, limit?: number): Promise<ActivityEvent[]>;
  createActivityEvent(event: InsertActivityEvent): Promise<ActivityEvent>;
  getActivityEventsByType(repositoryId: string, type: string): Promise<ActivityEvent[]>;
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

export class DatabaseStorage implements IStorage {
  async getSettings(): Promise<Settings | undefined> {
    const result = await db.select().from(settings);
    return result[0];
  }

  async upsertSettings(data: InsertSettings): Promise<Settings> {
    const existing = await this.getSettings();
    if (existing) {
      const result = await db
        .update(settings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(settings.id, existing.id))
        .returning();
      return result[0];
    }
    const result = await db.insert(settings).values(data).returning();
    return result[0];
  }

  async getRepositories(): Promise<Repository[]> {
    return db.select().from(repositories).orderBy(desc(repositories.createdAt));
  }

  async getRepository(id: string): Promise<Repository | undefined> {
    const result = await db.select().from(repositories).where(eq(repositories.id, id));
    return result[0];
  }

  async createRepository(repo: InsertRepository): Promise<Repository> {
    const result = await db.insert(repositories).values(repo).returning();
    return result[0];
  }

  async updateRepository(id: string, data: Partial<InsertRepository>): Promise<Repository | undefined> {
    const result = await db
      .update(repositories)
      .set(data)
      .where(eq(repositories.id, id))
      .returning();
    return result[0];
  }

  async deleteRepository(id: string): Promise<void> {
    await db.delete(repositories).where(eq(repositories.id, id));
  }

  async getAgentRoles(repositoryId: string): Promise<AgentRole[]> {
    return db
      .select()
      .from(agentRoles)
      .where(eq(agentRoles.repositoryId, repositoryId))
      .orderBy(desc(agentRoles.createdAt));
  }

  async createAgentRole(role: InsertAgentRole): Promise<AgentRole> {
    const result = await db.insert(agentRoles).values(role).returning();
    return result[0];
  }

  async updateAgentRole(id: string, data: Partial<InsertAgentRole>): Promise<AgentRole | undefined> {
    const result = await db
      .update(agentRoles)
      .set(data)
      .where(eq(agentRoles.id, id))
      .returning();
    return result[0];
  }

  async deleteAgentRolesByRepository(repositoryId: string): Promise<void> {
    await db.delete(agentRoles).where(eq(agentRoles.repositoryId, repositoryId));
  }

  async getAnalysisResults(repositoryId: string, limit?: number): Promise<AnalysisResult[]> {
    const query = db
      .select()
      .from(analysisResults)
      .where(eq(analysisResults.repositoryId, repositoryId))
      .orderBy(desc(analysisResults.createdAt));
    if (limit) {
      return query.limit(limit);
    }
    return query;
  }

  async createAnalysisResult(result: InsertAnalysisResult): Promise<AnalysisResult> {
    const rows = await db.insert(analysisResults).values(result).returning();
    return rows[0];
  }

  async getActivityEvents(repositoryId: string, limit?: number): Promise<ActivityEvent[]> {
    const query = db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.repositoryId, repositoryId))
      .orderBy(desc(activityEvents.createdAt));
    if (limit) {
      return query.limit(limit);
    }
    return query;
  }

  async createActivityEvent(event: InsertActivityEvent): Promise<ActivityEvent> {
    const rows = await db.insert(activityEvents).values(event).returning();
    return rows[0];
  }

  async getActivityEventsByType(repositoryId: string, type: string): Promise<ActivityEvent[]> {
    return db
      .select()
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.repositoryId, repositoryId),
          eq(activityEvents.type, type),
        ),
      )
      .orderBy(desc(activityEvents.createdAt));
  }
}

export const storage = new DatabaseStorage();
