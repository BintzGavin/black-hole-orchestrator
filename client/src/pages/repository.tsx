import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Link, useParams } from "wouter";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
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
  Calendar,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Zap,
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { GravityRing } from "@/components/gravity-ring";
import { GravityVisualization } from "@/components/gravity-visualization";
import { FileContentSheet } from "@/components/file-content-sheet";
import { PlanListSheet } from "@/components/plan-list-sheet";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { db } from "@/lib/db";
import type {
  Repository,
  AgentRole,
  AgentFile,
  ActivityEvent,
  AnalysisResult,
  HighFidelityAnalysis,
} from "@shared/schema";

const SCAN_MESSAGES = [
  "Scanning repository tree...",
  "Classifying agent files...",
  "Extracting agent identities...",
  "Matching plans to agents...",
  "Parsing prompt boundaries...",
  "Grouping files by agent...",
  "Building agent profiles...",
  "Almost there...",
];

const FILE_TYPE_LABELS: Record<AgentFile["type"], { label: string; color: string }> = {
  "planning-prompt": { label: "Planning", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  "execution-prompt": { label: "Execution", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  "prompt": { label: "Prompt", color: "bg-violet-500/20 text-violet-400 border-violet-500/30" },
  "status": { label: "Status", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  "progress": { label: "Progress", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
  "plan": { label: "Plan", color: "bg-pink-500/20 text-pink-400 border-pink-500/30" },
  "governance": { label: "Governance", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  "other": { label: "Other", color: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
};

const CATEGORY_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  domain: { label: "Domain Agent", variant: "default" },
  daily: { label: "Daily Agent", variant: "secondary" },
  shared: { label: "Shared", variant: "outline" },
};

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
  const [timespan, setTimespan] = useState<string>("all");
  const [liveCounts, setLiveCounts] = useState<{ totalCommits: number; totalPrs: number } | null>(null);
  const [countsLoading, setCountsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState(SCAN_MESSAGES[0]);
  const scanMsgRef = useRef(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ path: string; type: string } | null>(null);
  const [fileSheetOpen, setFileSheetOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [planListSheetOpen, setPlanListSheetOpen] = useState(false);
  const [selectedRoleForPlans, setSelectedRoleForPlans] = useState<AgentRole | null>(null);
  const [openedFromPlanList, setOpenedFromPlanList] = useState(false);

  // Cycle scan status messages while scanning
  useEffect(() => {
    if (!scanning) {
      scanMsgRef.current = 0;
      setScanMessage(SCAN_MESSAGES[0]);
      return;
    }
    const interval = setInterval(() => {
      scanMsgRef.current = Math.min(scanMsgRef.current + 1, SCAN_MESSAGES.length - 1);
      setScanMessage(SCAN_MESSAGES[scanMsgRef.current]);
    }, 2500);
    return () => clearInterval(interval);
  }, [scanning]);

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

  // Fetch live counts whenever timespan or repo changes
  useEffect(() => {
    if (!repo) return;
    let cancelled = false;

    const fetchCounts = async () => {
      setCountsLoading(true);
      try {
        let since: string | undefined;
        if (timespan !== "all") {
          const now = new Date();
          const ms: Record<string, number> = {
            "7d": 7 * 86400000,
            "30d": 30 * 86400000,
            "90d": 90 * 86400000,
            "1y": 365 * 86400000,
          };
          since = new Date(now.getTime() - (ms[timespan] || 0)).toISOString();
        }

        const res = await apiRequest("POST", "/api/github/counts", {
          owner: repo.owner,
          name: repo.name,
          since,
        });
        const data = await res.json();
        if (cancelled) return;
        setLiveCounts(data);

        // Persist all-time counts back to IndexedDB so future page loads aren't stale
        if (timespan === "all") {
          await db.updateRepository(repo.id, {
            totalCommits: data.totalCommits,
            totalPrs: data.totalPrs,
          });
        }
      } catch (err) {
        console.error("Failed to fetch counts:", err);
      } finally {
        if (!cancelled) setCountsLoading(false);
      }
    };

    fetchCounts();
    return () => { cancelled = true; };
  }, [repo?.id, repo?.owner, repo?.name, timespan]);

  // Compute since date from timespan for client-side filtering
  const sinceDate = useMemo(() => {
    if (timespan === "all") return null;
    const ms: Record<string, number> = {
      "7d": 7 * 86400000,
      "30d": 30 * 86400000,
      "90d": 90 * 86400000,
      "1y": 365 * 86400000,
    };
    return new Date(Date.now() - (ms[timespan] || 0));
  }, [timespan]);

  // Filter events + analyses by timespan
  const filteredEvents = useMemo(() => {
    if (!sinceDate) return events;
    return events.filter(e => new Date(e.createdAt) >= sinceDate);
  }, [events, sinceDate]);

  const filteredAnalyses = useMemo(() => {
    if (!sinceDate) return analyses;
    return analyses.filter(a => new Date(a.createdAt) >= sinceDate);
  }, [analyses, sinceDate]);

  const filteredLatestAnalysis = filteredAnalyses[0] ?? null;

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

  const latestAnalysis = filteredLatestAnalysis;

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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
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
          {/* Timespan filter bar — controls the entire page */}
          <div className="flex items-center justify-between gap-3 flex-wrap" data-testid="timespan-filter">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="w-3.5 h-3.5" />
                <span>Period</span>
              </div>
              <ToggleGroup
                type="single"
                value={timespan}
                onValueChange={(val) => { if (val) setTimespan(val); }}
                size="sm"
                variant="outline"
                className="gap-0.5"
              >
                {[
                  { value: "7d", label: "7d" },
                  { value: "30d", label: "30d" },
                  { value: "90d", label: "90d" },
                  { value: "1y", label: "1y" },
                  { value: "all", label: "All time" },
                ].map((opt) => (
                  <ToggleGroupItem
                    key={opt.value}
                    value={opt.value}
                    className="text-xs px-3 h-7 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                    data-testid={`filter-${opt.value}`}
                  >
                    {opt.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {countsLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
            </div>
            <div className="flex items-center gap-2">
              <GravityRing value={repo.gravityScore ?? 0} size={36} strokeWidth={4} />
              <span className="text-sm font-semibold">Gravity: {repo.gravityScore ?? 0}</span>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                label: "Total PRs",
                value: liveCounts?.totalPrs ?? repo.totalPrs ?? 0,
                icon: GitPullRequest,
                isCount: true,
              },
              {
                label: "Total Commits",
                value: liveCounts?.totalCommits ?? repo.totalCommits ?? 0,
                icon: GitCommit,
                isCount: true,
              },
              {
                label: "Activity Events",
                value: filteredEvents.length,
                icon: Activity,
                isCount: false,
              },
              {
                label: "Analyses",
                value: filteredAnalyses.length,
                icon: Orbit,
                isCount: false,
              },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 + i * 0.05 }}
              >
                <Card data-testid={`card-stat-${stat.label.toLowerCase().replace(/\s/g, "-")}`}>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <stat.icon className="w-4 h-4" />
                      <span className="text-xs">{stat.label}</span>
                    </div>
                    {countsLoading && stat.isCount ? (
                      <Skeleton className="h-7 w-16 mt-0.5" />
                    ) : (
                      <p className="text-xl font-bold">{stat.value}</p>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Agent Orbit — full width hero */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
          >
            <Card data-testid="card-visualization" className="w-full flex flex-col overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Agent Orbit</CardTitle>
                <CardDescription>
                  Gravitational field visualization · Click an agent to view details
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 w-full h-[800px]">
                <GravityVisualization
                  repoName={repo.name}
                  roles={roles}
                  agentStates={latestAnalysis?.details?.analysis?.agentStates}
                  className="h-full"
                  onAgentClick={(roleId) => {
                    const role = roles.find(r => r.id === roleId);
                    if (role) {
                      setSelectedRoleForPlans(role);
                      setPlanListSheetOpen(true);
                    }
                  }}
                />
              </CardContent>
            </Card>
          </motion.div>

          {/* Latest Analysis — enriched */}
          {latestAnalysis ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
            >
              <Card data-testid="card-latest-analysis">
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-lg">Latest Analysis</CardTitle>
                      <Badge variant="outline">{latestAnalysis.type}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(latestAnalysis.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(() => {
                    const analysisData = latestAnalysis.details?.analysis as HighFidelityAnalysis | undefined;
                    if (analysisData) {
                      return (
                        <div className="space-y-6">
                          <div className="bg-primary/5 p-4 rounded-lg border border-primary/20">
                            <h4 className="flex items-center gap-2 font-semibold text-primary mb-2 text-sm">
                              <Zap className="w-4 h-4" /> Executive Summary
                            </h4>
                            <p className="text-sm text-foreground/90">{analysisData.executiveSummary}</p>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {analysisData.significantProgress.length > 0 && (
                              <div className="space-y-3">
                                <h4 className="flex items-center gap-2 font-semibold text-sm">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Recent Progress
                                </h4>
                                <div className="space-y-2">
                                  {analysisData.significantProgress.map((prog, i) => (
                                    <div key={i} className="flex gap-2 text-sm bg-muted/50 p-2 rounded border border-border/50">
                                      <Badge variant="outline" className="h-fit capitalize text-[10px]">{prog.actor}</Badge>
                                      <span className="text-muted-foreground leading-snug">{prog.description}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {analysisData.frictionAndThrashing.length > 0 && (
                              <div className="space-y-3">
                                <h4 className="flex items-center gap-2 font-semibold text-sm">
                                  <AlertTriangle className="w-4 h-4 text-amber-500" /> Friction Areas
                                </h4>
                                <div className="space-y-2">
                                  {analysisData.frictionAndThrashing.map((frict, i) => (
                                    <div key={i} className="flex flex-col gap-1.5 text-sm bg-muted/50 p-2.5 rounded border border-border/50">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <Badge variant={frict.severity === "critical" ? "destructive" : frict.severity === "medium" ? "secondary" : "outline"} className="text-[10px]">
                                          {frict.severity}
                                        </Badge>
                                        <span className="font-medium text-foreground">{frict.component}</span>
                                      </div>
                                      <span className="text-muted-foreground text-xs leading-relaxed">{frict.issue}</span>
                                      <div className="bg-background/50 p-1.5 rounded mt-0.5 border border-amber-500/20">
                                        <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium tracking-tight">Cause: {frict.suspectedCause}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {analysisData.boundaryViolations.length > 0 && (
                            <div className="space-y-3">
                              <h4 className="flex items-center gap-2 font-semibold text-sm text-destructive">
                                <ShieldAlert className="w-4 h-4" /> Boundary Violations
                              </h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {analysisData.boundaryViolations.map((viol, i) => (
                                  <div key={i} className="flex flex-col gap-1 text-sm bg-destructive/5 p-2.5 rounded border border-destructive/20">
                                    <span className="font-semibold text-destructive">{viol.agentOrRole}</span>
                                    <span className="text-foreground/90 text-xs">{viol.violation}</span>
                                    <span className="text-[10px] text-muted-foreground mt-1 truncate" title={viol.evidence}>Evidence: {viol.evidence}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {analysisData.orchestratorActions.length > 0 && (
                            <div className="space-y-3 mt-2">
                              <h4 className="flex items-center gap-2 font-semibold text-sm">
                                <Activity className="w-4 h-4 text-blue-500" /> Recommended Actions
                              </h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {analysisData.orchestratorActions.map((act, i) => (
                                  <div key={i} className="flex flex-col gap-2 text-sm bg-muted/30 p-2.5 rounded border border-border/50">
                                    <div className="flex justify-between items-start gap-2">
                                      <span className="font-medium text-foreground text-xs leading-none mt-0.5">{act.action}</span>
                                      <Badge variant={act.urgency === "do-now" ? "default" : "outline"} className="text-[9px] shrink-0 h-4 px-1">{act.urgency}</Badge>
                                    </div>
                                    <span className="text-[11px] text-muted-foreground leading-relaxed">{act.reason}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground border-b border-border/50 pb-4 mb-4">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {latestAnalysis.summary}
                        </ReactMarkdown>
                      </div>
                    );
                  })()}

                  {/* Score + metadata row */}
                  <div className="flex items-center gap-4 flex-wrap">
                    {latestAnalysis.score !== null && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Score</span>
                        <span className="text-lg font-bold">{latestAnalysis.score}</span>
                      </div>
                    )}
                    {latestAnalysis.details?.commitsAnalyzed != null && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <GitCommit className="w-3.5 h-3.5" />
                        <span>{latestAnalysis.details.commitsAnalyzed} commits analyzed</span>
                      </div>
                    )}
                    {latestAnalysis.details?.prsAnalyzed != null && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <GitPullRequest className="w-3.5 h-3.5" />
                        <span>{latestAnalysis.details.prsAnalyzed} PRs analyzed</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <Card data-testid="card-no-analysis">
              <CardContent className="py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  {sinceDate ? `No analyses found in the selected time period.` : `No analyses yet. Click "Run Analysis" to get started.`}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="agents" className="space-y-4">
          {/* Scan loading overlay */}
          <AnimatePresence>
            {scanning && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
              >
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="flex flex-col items-center justify-center py-16 space-y-6">
                    <div className="relative">
                      <svg viewBox="0 0 120 120" className="w-24 h-24">
                        <defs>
                          <radialGradient id="scanGlow" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="hsl(258, 90%, 66%)" stopOpacity="0.6" />
                            <stop offset="100%" stopColor="hsl(258, 90%, 66%)" stopOpacity="0" />
                          </radialGradient>
                        </defs>
                        {/* Pulsing center */}
                        <circle cx="60" cy="60" r="12" fill="hsl(258, 90%, 66%)">
                          <animate attributeName="r" values="10;14;10" dur="2s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.8;1;0.8" dur="2s" repeatCount="indefinite" />
                        </circle>
                        <circle cx="60" cy="60" r="24" fill="url(#scanGlow)">
                          <animate attributeName="r" values="20;28;20" dur="2s" repeatCount="indefinite" />
                        </circle>
                        {/* Orbiting dots */}
                        {[0, 1, 2, 3].map((i) => (
                          <circle key={i} cx="60" cy="20" r="4" fill="hsl(258, 90%, 66%)" opacity="0.7">
                            <animateTransform
                              attributeName="transform"
                              type="rotate"
                              from={`${i * 90} 60 60`}
                              to={`${i * 90 + 360} 60 60`}
                              dur={`${3 + i * 0.5}s`}
                              repeatCount="indefinite"
                            />
                            <animate attributeName="opacity" values="0.3;0.8;0.3" dur={`${1.5 + i * 0.3}s`} repeatCount="indefinite" />
                          </circle>
                        ))}
                        {/* Orbit ring */}
                        <circle cx="60" cy="60" r="40" fill="none" stroke="hsl(258, 90%, 66%)" strokeWidth="0.5" strokeDasharray="4 4" opacity="0.3">
                          <animateTransform attributeName="transform" type="rotate" from="0 60 60" to="360 60 60" dur="20s" repeatCount="indefinite" />
                        </circle>
                      </svg>
                    </div>
                    <div className="text-center space-y-2">
                      <motion.p
                        key={scanMessage}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="text-sm font-medium text-primary"
                      >
                        {scanMessage}
                      </motion.p>
                      <p className="text-xs text-muted-foreground">
                        This may take a minute for large repositories
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {!scanning && roles.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {roles.map((role, index) => {
                const cat = CATEGORY_LABELS[role.category] || CATEGORY_LABELS.shared;
                return (
                  <motion.div
                    key={role.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    id={`card-role-${role.id}`}
                  >
                    <Card data-testid={`card-role-${role.id}`}>
                      <CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap pb-3">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-base">
                              {role.name}
                            </CardTitle>
                            <Badge variant={cat.variant} className="text-[10px] px-1.5 py-0">
                              {cat.label}
                            </Badge>
                          </div>
                          {role.description && (
                            <CardDescription className="text-xs line-clamp-2">
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
                        {/* Attributed files */}
                        {role.files && role.files.length > 0 && (() => {
                          const MAX_VISIBLE = 5;
                          const grouped = role.files.reduce<Record<string, number>>((acc, f) => {
                            acc[f.type] = (acc[f.type] || 0) + 1;
                            return acc;
                          }, {});
                          const summary = Object.entries(grouped)
                            .map(([type, count]) => {
                              const meta = FILE_TYPE_LABELS[type as AgentFile["type"]] || FILE_TYPE_LABELS.other;
                              return `${count} ${meta.label}${count !== 1 ? "s" : ""}`;
                            })
                            .join(" · ");
                          const nonPlanFiles = role.files.filter(f => f.type !== "plan");
                          const planFiles = role.files.filter(f => f.type === "plan");
                          const visibleFiles = nonPlanFiles.slice(0, MAX_VISIBLE);
                          const hasMore = nonPlanFiles.length > MAX_VISIBLE || planFiles.length > 0;
                          return (
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-muted-foreground">
                                {summary}
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {visibleFiles.map((file, fi) => {
                                  const meta = FILE_TYPE_LABELS[file.type] || FILE_TYPE_LABELS.other;
                                  const fileName = file.path.split("/").pop() || file.path;
                                  return (
                                    <button
                                      key={fi}
                                      onClick={() => {
                                        setSelectedFile({ path: file.path, type: file.type });
                                        setOpenedFromPlanList(false);
                                        setFileSheetOpen(true);
                                      }}
                                      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border cursor-pointer hover:opacity-80 transition-opacity ${meta.color}`}
                                      title={`Click to view ${file.path}`}
                                    >
                                      <span className="font-medium">{meta.label}</span>
                                      <span className="opacity-70 truncate max-w-[120px]">{fileName}</span>
                                    </button>
                                  );
                                })}
                                {planFiles.length > 0 && (
                                  <button
                                    onClick={() => {
                                      setSelectedRoleForPlans(role);
                                      setPlanListSheetOpen(true);
                                    }}
                                    className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border cursor-pointer hover:opacity-80 transition-opacity ${FILE_TYPE_LABELS.plan.color}`}
                                    title={`Click to browse ${planFiles.length} plan files`}
                                  >
                                    <span className="font-medium">{planFiles.length} Plans</span>
                                  </button>
                                )}
                                {nonPlanFiles.length > MAX_VISIBLE && (
                                  <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                                    +{nonPlanFiles.length - MAX_VISIBLE} more
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          ) : !scanning ? (
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
                  <Search className="w-4 h-4" />
                  Scan for Agents
                </Button>
              </CardContent>
            </Card>
          ) : null}
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
                      <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {analysis.summary}
                        </ReactMarkdown>
                      </div>
                      {analysis.details != null && (
                        <div className="pt-2 space-y-4">
                          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                            {(analysis.details as any).commitsAnalyzed != null && (
                              <div className="flex items-center gap-1.5">
                                <GitCommit className="w-3.5 h-3.5" />
                                <span>
                                  {(analysis.details as any).commitsAnalyzed} commits analyzed
                                </span>
                              </div>
                            )}
                            {(analysis.details as any).prsAnalyzed != null && (
                              <div className="flex items-center gap-1.5">
                                <GitPullRequest className="w-3.5 h-3.5" />
                                <span>
                                  {(analysis.details as any).prsAnalyzed} PRs analyzed
                                </span>
                              </div>
                            )}
                          </div>
                          {(analysis.details as any).fullResponse && (
                            <details className="text-sm border rounded-md open:bg-muted/30">
                              <summary className="cursor-pointer font-medium p-3 hover:bg-muted/50 rounded-md transition-colors">
                                View Full Analysis
                              </summary>
                              <div className="p-4 pt-2 border-t mt-1">
                                <article className="prose prose-sm dark:prose-invert max-w-none prose-headings:scroll-mt-4 prose-pre:bg-muted prose-pre:text-foreground prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {(analysis.details as any).fullResponse}
                                  </ReactMarkdown>
                                </article>
                              </div>
                            </details>
                          )}
                        </div>
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
      <FileContentSheet
        open={fileSheetOpen}
        onOpenChange={setFileSheetOpen}
        filePath={selectedFile?.path ?? null}
        fileType={selectedFile?.type ?? null}
        repoOwner={repo.owner}
        repoName={repo.name}
        repoBranch={repo.defaultBranch || "main"}
        onBack={openedFromPlanList ? () => {
          setFileSheetOpen(false);
          setPlanListSheetOpen(true);
        } : undefined}
      />
      <PlanListSheet
        open={planListSheetOpen}
        onOpenChange={setPlanListSheetOpen}
        files={selectedRoleForPlans?.files?.filter(f => f.type === "plan") ?? null}
        prEvents={events.filter(e => {
          if (e.type !== "pull_request" || !selectedRoleForPlans) return false;
          const roleName = selectedRoleForPlans.name.toLowerCase();
          const title = (e.title || "").toLowerCase();
          const desc = (e.description || "").toLowerCase();
          return title.includes(roleName) || desc.includes(roleName);
        })}
        repoOwner={repo.owner}
        repoName={repo.name}
        roleName={selectedRoleForPlans?.name}
        onSelectFile={(file) => {
          setSelectedFile({ path: file.path, type: file.type });
          setOpenedFromPlanList(true);
          setPlanListSheetOpen(false);
          setFileSheetOpen(true);
        }}
      />
    </div>
  );
}
