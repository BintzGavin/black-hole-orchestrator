import { useState, useEffect, useCallback } from "react";
import { Link, useParams } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  GitPullRequest,
  GitCommit,
  GitBranch,
  RefreshCw,
  Search,
  Loader2,
  Activity,
  Orbit,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GravityRing } from "@/components/gravity-ring";
import { GravityVisualization } from "@/components/gravity-visualization";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { db } from "@/lib/db";
import type {
  Repository,
  AgentRole,
  ActivityEvent,
  AnalysisResult,
} from "@shared/schema";

function getStatusVariant(status: string | null): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active":
      return "default";
    case "saturated":
      return "secondary";
    case "drifting":
      return "destructive";
    default:
      return "outline";
  }
}

function getEventIcon(type: string) {
  switch (type) {
    case "commit":
      return <GitCommit className="w-4 h-4" />;
    case "pull_request":
      return <GitPullRequest className="w-4 h-4" />;
    case "merge":
      return <GitBranch className="w-4 h-4" />;
    default:
      return <Activity className="w-4 h-4" />;
  }
}

export default function RepositoryPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [activityLimit, setActivityLimit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const [repo, setRepo] = useState<Repository | undefined>();
  const [roles, setRoles] = useState<AgentRole[]>([]);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const [repoData, rolesData, eventsData, analysesData] = await Promise.all([
        db.getRepository(id),
        db.getAgentRoles(id),
        db.getActivityEvents(id),
        db.getAnalysisResults(id),
      ]);
      setRepo(repoData);
      setRoles(rolesData);
      setEvents(eventsData);
      setAnalyses(analysesData);
    } catch (error) {
      console.error("Failed to load repository data:", error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleScan = async () => {
    if (!repo) return;
    setScanning(true);
    try {
      const res = await apiRequest("POST", "/api/github/scan", {
        owner: repo.owner,
        name: repo.name,
        defaultBranch: repo.defaultBranch,
      });
      const scannedRoles = await res.json();
      await db.setAgentRoles(repo.id, scannedRoles);
      await loadData();
      toast({ title: "Agent scan complete" });
    } catch (error: any) {
      toast({
        title: "Scan failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setScanning(false);
    }
  };

  const handleAnalyze = async () => {
    if (!repo) return;
    setAnalyzing(true);
    try {
      const res = await apiRequest("POST", "/api/github/analyze", {
        owner: repo.owner,
        name: repo.name,
      });
      const result = await res.json();

      await db.setActivityEvents(repo.id, result.activityEvents);

      await db.createAnalysisResult({
        repositoryId: repo.id,
        type: "ai_analysis",
        summary: result.summary,
        score: result.gravityScore,
        details: {
          fullResponse: result.fullResponse,
          commitsAnalyzed: result.commitsAnalyzed,
          prsAnalyzed: result.prsAnalyzed,
        },
      });

      await db.updateRepository(repo.id, {
        gravityScore: result.gravityScore,
        lastAnalyzedAt: new Date().toISOString(),
        totalCommits: result.commitsAnalyzed,
        totalPrs: result.prsAnalyzed,
      });

      await loadData();
      toast({ title: "Analysis complete" });
    } catch (error: any) {
      toast({
        title: "Analysis failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!repo) {
    return (
      <div className="p-6 space-y-4">
        <Link href="/">
          <Button variant="ghost" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Repository not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const latestAnalysis = analyses[0];

  return (
    <div className="p-6 space-y-6" data-testid="page-repository">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold" data-testid="text-repo-name">
              {repo.fullName}
            </h1>
            {repo.description && (
              <p className="text-sm text-muted-foreground">
                {repo.description}
              </p>
            )}
          </div>
          {repo.gravityScore !== null && (
            <Badge variant="outline" data-testid="badge-gravity-score">
              Gravity: {repo.gravityScore}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={handleScan}
            disabled={scanning}
            data-testid="button-scan-agents"
          >
            {scanning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            Scan for Agents
          </Button>
          <Button
            onClick={handleAnalyze}
            disabled={analyzing}
            data-testid="button-run-analysis"
          >
            {analyzing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Run Analysis
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList data-testid="tabs-repo-detail">
          <TabsTrigger value="overview" data-testid="tab-overview">
            Overview
          </TabsTrigger>
          <TabsTrigger value="agents" data-testid="tab-agents">
            Agent Roles
          </TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-activity">
            Activity
          </TabsTrigger>
          <TabsTrigger value="analyses" data-testid="tab-analyses">
            Analysis History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Card data-testid="card-gravity-overview">
                <CardHeader>
                  <CardTitle className="text-lg">Gravity Score</CardTitle>
                  <CardDescription>
                    Overall architectural health metric
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-center py-8">
                  <GravityRing
                    value={repo.gravityScore ?? 0}
                    size={160}
                    strokeWidth={10}
                  />
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <Card data-testid="card-visualization">
                <CardHeader>
                  <CardTitle className="text-lg">Agent Orbit</CardTitle>
                  <CardDescription>
                    Gravitational field visualization
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <GravityVisualization
                    repoName={repo.name}
                    roles={roles}
                  />
                </CardContent>
              </Card>
            </motion.div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                label: "Total PRs",
                value: repo.totalPrs ?? 0,
                icon: GitPullRequest,
              },
              {
                label: "Total Commits",
                value: repo.totalCommits ?? 0,
                icon: GitCommit,
              },
              {
                label: "Agent Roles",
                value: roles.length,
                icon: Orbit,
              },
              {
                label: "Last Analyzed",
                value: repo.lastAnalyzedAt
                  ? new Date(repo.lastAnalyzedAt).toLocaleDateString()
                  : "Never",
                icon: Activity,
              },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.2 + i * 0.05 }}
              >
                <Card data-testid={`card-stat-${stat.label.toLowerCase().replace(/\s/g, "-")}`}>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <stat.icon className="w-4 h-4" />
                      <span className="text-xs">{stat.label}</span>
                    </div>
                    <p className="text-xl font-bold">{stat.value}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {latestAnalysis && (
            <Card data-testid="card-latest-analysis">
              <CardHeader>
                <div className="flex items-center gap-3 flex-wrap">
                  <CardTitle className="text-lg">Latest Analysis</CardTitle>
                  <Badge variant="outline">
                    {latestAnalysis.type}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {latestAnalysis.summary}
                </p>
                {latestAnalysis.score !== null && (
                  <p className="text-sm mt-2">
                    Score:{" "}
                    <span className="font-semibold">
                      {latestAnalysis.score}
                    </span>
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="agents" className="space-y-4">
          {roles.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {roles.map((role, index) => (
                <motion.div
                  key={role.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                >
                  <Card data-testid={`card-role-${role.id}`}>
                    <CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap pb-3">
                      <div className="space-y-1 min-w-0 flex-1">
                        <CardTitle className="text-base">
                          {role.name}
                        </CardTitle>
                        {role.description && (
                          <CardDescription className="text-xs">
                            {role.description}
                          </CardDescription>
                        )}
                      </div>
                      <Badge
                        variant={getStatusVariant(role.status)}
                        data-testid={`badge-status-${role.id}`}
                      >
                        {role.status ?? "unknown"}
                      </Badge>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {role.promptFile && (
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          {role.promptFile}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                        <span>{role.planCount ?? 0} plans</span>
                        <span>{role.prCount ?? 0} PRs</span>
                      </div>
                      {role.boundaries && role.boundaries.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {role.boundaries.map((boundary, bi) => (
                            <Badge
                              key={bi}
                              variant="outline"
                              className="text-xs"
                            >
                              {boundary}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          ) : (
            <Card data-testid="card-no-agents">
              <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted">
                  <Orbit className="w-6 h-6 text-muted-foreground" />
                </div>
                <div className="text-center space-y-1">
                  <h3 className="font-semibold">No agent roles detected</h3>
                  <p className="text-sm text-muted-foreground">
                    Scan the repository to detect agent prompt files and roles.
                  </p>
                </div>
                <Button
                  onClick={handleScan}
                  disabled={scanning}
                  data-testid="button-scan-agents-empty"
                >
                  {scanning ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                  Scan for Agents
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          {events.length > 0 ? (
            <ScrollArea className="h-[600px]">
              <div className="space-y-2 pr-4">
                {events.slice(0, activityLimit).map((event) => (
                  <Card key={event.id} data-testid={`card-event-${event.id}`}>
                    <CardContent className="flex items-start gap-3 py-3 px-4 flex-wrap">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted shrink-0 mt-0.5">
                        {getEventIcon(event.type)}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">
                            {event.title}
                          </p>
                          <Badge variant="outline" className="text-xs">
                            {event.type}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          {event.author && <span>{event.author}</span>}
                          {event.createdAt && (
                            <span>
                              {new Date(event.createdAt).toLocaleDateString()}
                            </span>
                          )}
                          {(event.filesChanged ?? 0) > 0 && (
                            <span>{event.filesChanged} files</span>
                          )}
                          {(event.additions ?? 0) > 0 && (
                            <span className="text-green-500">
                              +{event.additions}
                            </span>
                          )}
                          {(event.deletions ?? 0) > 0 && (
                            <span className="text-red-500">
                              -{event.deletions}
                            </span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {events.length > activityLimit && (
                  <div className="flex justify-center pt-2">
                    <Button
                      variant="outline"
                      onClick={() =>
                        setActivityLimit((prev) => prev + 50)
                      }
                      data-testid="button-load-more-events"
                    >
                      Load More
                    </Button>
                  </div>
                )}
              </div>
            </ScrollArea>
          ) : (
            <Card data-testid="card-no-activity">
              <CardContent className="flex flex-col items-center justify-center py-12 space-y-3">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted">
                  <Activity className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  No activity events recorded yet
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="analyses" className="space-y-4">
          {analyses.length > 0 ? (
            <div className="space-y-3">
              {analyses.map((analysis, index) => (
                <motion.div
                  key={analysis.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                >
                  <Card
                    data-testid={`card-analysis-${analysis.id}`}
                  >
                    <CardContent className="py-4 px-5 space-y-2">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline">
                            {analysis.type}
                          </Badge>
                          {analysis.score !== null && (
                            <span className="text-sm font-medium">
                              Score: {analysis.score}
                            </span>
                          )}
                        </div>
                        {analysis.createdAt && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(
                              analysis.createdAt
                            ).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {analysis.summary}
                      </p>
                      {analysis.details != null && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground">
                            View details
                          </summary>
                          <pre className="mt-2 p-3 bg-muted rounded-md overflow-auto text-xs">
                            {String(JSON.stringify(analysis.details, null, 2))}
                          </pre>
                        </details>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          ) : (
            <Card data-testid="card-no-analyses">
              <CardContent className="flex flex-col items-center justify-center py-12 space-y-3">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted">
                  <RefreshCw className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  No analysis results yet. Run an analysis to get started.
                </p>
                <Button
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  data-testid="button-run-analysis-empty"
                >
                  {analyzing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Run Analysis
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
