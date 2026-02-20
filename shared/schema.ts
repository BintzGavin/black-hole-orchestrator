import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  githubPat: text("github_pat"),
  aiProvider: text("ai_provider"),
  aiApiKey: text("ai_api_key"),
  aiModel: text("ai_model"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSettingsSchema = createInsertSchema(settings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settings.$inferSelect;

export const repositories = pgTable("repositories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  fullName: text("full_name").notNull(),
  description: text("description"),
  defaultBranch: text("default_branch").default("main"),
  lastAnalyzedAt: timestamp("last_analyzed_at"),
  gravityScore: integer("gravity_score"),
  totalPrs: integer("total_prs").default(0),
  totalCommits: integer("total_commits").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRepositorySchema = createInsertSchema(repositories).omit({
  id: true,
  createdAt: true,
});

export type InsertRepository = z.infer<typeof insertRepositorySchema>;
export type Repository = typeof repositories.$inferSelect;

export const agentRoles = pgTable("agent_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  repositoryId: varchar("repository_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  promptFile: text("prompt_file"),
  boundaries: text("boundaries").array(),
  status: text("status").default("active"),
  planCount: integer("plan_count").default(0),
  prCount: integer("pr_count").default(0),
  lastActiveAt: timestamp("last_active_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAgentRoleSchema = createInsertSchema(agentRoles).omit({
  id: true,
  createdAt: true,
});

export type InsertAgentRole = z.infer<typeof insertAgentRoleSchema>;
export type AgentRole = typeof agentRoles.$inferSelect;

export const analysisResults = pgTable("analysis_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  repositoryId: varchar("repository_id").notNull(),
  type: text("type").notNull(),
  summary: text("summary").notNull(),
  details: jsonb("details"),
  score: integer("score"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAnalysisResultSchema = createInsertSchema(analysisResults).omit({
  id: true,
  createdAt: true,
});

export type InsertAnalysisResult = z.infer<typeof insertAnalysisResultSchema>;
export type AnalysisResult = typeof analysisResults.$inferSelect;

export const activityEvents = pgTable("activity_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  repositoryId: varchar("repository_id").notNull(),
  agentRoleId: varchar("agent_role_id"),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  sha: text("sha"),
  prNumber: integer("pr_number"),
  author: text("author"),
  filesChanged: integer("files_changed").default(0),
  additions: integer("additions").default(0),
  deletions: integer("deletions").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertActivityEventSchema = createInsertSchema(activityEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertActivityEvent = z.infer<typeof insertActivityEventSchema>;
export type ActivityEvent = typeof activityEvents.$inferSelect;
