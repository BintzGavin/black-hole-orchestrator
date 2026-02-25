import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  Plus,
  GitPullRequest,
  GitCommit,
  Loader2,
  Orbit,
  Search,
  Settings,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { GravityRing } from "@/components/gravity-ring";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { db } from "@/lib/db";
import type { Repository, Settings as SettingsType } from "@shared/schema";

export default function Dashboard() {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [repoInput, setRepoInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [reposLoading, setReposLoading] = useState(true);
  const { toast } = useToast();

  const { data: settings, isLoading: settingsLoading } = useQuery<SettingsType>({
    queryKey: ["/api/settings"],
  });

  const seededRef = useRef(false);

  const loadRepos = useCallback(async () => {
    try {
      const repositories = await db.getRepositories();
      setRepos(repositories);

      // Auto-seed BintzGavin/helios on first visit when empty
      if (repositories.length === 0 && !seededRef.current) {
        seededRef.current = true;
        try {
          const res = await apiRequest("POST", "/api/github/repo", { owner: "BintzGavin", name: "helios" });
          const repoData = await res.json();
          await db.createRepository({
            owner: repoData.owner,
            name: repoData.name,
            fullName: repoData.fullName,
            description: repoData.description,
            defaultBranch: repoData.defaultBranch,
          });
          const updatedRepos = await db.getRepositories();
          setRepos(updatedRepos);
        } catch (e) {
          console.error("Failed to seed default repository:", e);
        }
      }
    } catch (error) {
      console.error("Failed to load repositories:", error);
    } finally {
      setReposLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRepos();
  }, [loadRepos]);

  const handleAddRepo = async () => {
    if (!repoInput.includes("/")) {
      toast({
        title: "Invalid format",
        description: "Please enter in owner/name format",
        variant: "destructive",
      });
      return;
    }
    setAdding(true);
    try {
      const [owner, name] = repoInput.split("/");
      const res = await apiRequest("POST", "/api/github/repo", { owner, name });
      const repoData = await res.json();
      await db.createRepository({
        owner: repoData.owner,
        name: repoData.name,
        fullName: repoData.fullName,
        description: repoData.description,
        defaultBranch: repoData.defaultBranch,
      });
      await loadRepos();
      setAddDialogOpen(false);
      setRepoInput("");
      toast({ title: "Repository added successfully" });
    } catch (error: any) {
      toast({
        title: "Failed to add repository",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteRepo = async (id: string) => {
    try {
      await db.deleteRepository(id);
      await loadRepos();
      toast({ title: "Repository removed" });
    } catch (error: any) {
      toast({
        title: "Failed to remove repository",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const hasSettings = settings?.githubPat;

  if (reposLoading || settingsLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="page-dashboard">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            Mission Control
          </h1>
          <p className="text-sm text-muted-foreground">
            Black Hole Architecture Command Center
          </p>
        </div>
        <Button
          onClick={() => setAddDialogOpen(true)}
          data-testid="button-add-repository"
        >
          <Plus className="w-4 h-4" />
          Add Repository
        </Button>
      </div>

      {!hasSettings && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card data-testid="card-setup-prompt">
            <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
              <div className="space-y-1">
                <CardTitle className="text-lg">Configure GitHub Access</CardTitle>
                <CardDescription>
                  Set up your GITHUB_PAT environment variable to start monitoring repositories.
                </CardDescription>
              </div>
              <Link href="/settings">
                <Button variant="outline" data-testid="button-goto-settings">
                  <Settings className="w-4 h-4" />
                  Go to Settings
                </Button>
              </Link>
            </CardHeader>
          </Card>
        </motion.div>
      )}

      {repos.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {repos.map((repo, index) => (
            <motion.div
              key={repo.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
            >
              <Card
                className="hover-elevate cursor-pointer"
                data-testid={`card-repo-${repo.id}`}
              >
                <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap pb-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <CardTitle className="text-base truncate">
                      {repo.name}
                    </CardTitle>
                    <CardDescription className="text-xs truncate">
                      {repo.owner}
                    </CardDescription>
                  </div>
                  <GravityRing
                    value={repo.gravityScore ?? 0}
                    size={56}
                    strokeWidth={4}
                  />
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <GitPullRequest className="w-3.5 h-3.5" />
                      {repo.totalPrs ?? 0} PRs
                    </span>
                    <span className="flex items-center gap-1">
                      <GitCommit className="w-3.5 h-3.5" />
                      {repo.totalCommits ?? 0} Commits
                    </span>
                  </div>

                  {repo.lastAnalyzedAt && (
                    <p className="text-xs text-muted-foreground">
                      Analyzed{" "}
                      {new Date(repo.lastAnalyzedAt).toLocaleDateString()}
                    </p>
                  )}

                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    <Link href={`/repo/${repo.id}`}>
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`button-view-repo-${repo.id}`}
                      >
                        <Search className="w-3.5 h-3.5" />
                        View Details
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteRepo(repo.id);
                      }}
                      data-testid={`button-delete-repo-${repo.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          <Card data-testid="card-empty-state">
            <CardContent className="flex flex-col items-center justify-center py-16 space-y-4">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted">
                <Orbit className="w-8 h-8 text-muted-foreground" />
              </div>
              <div className="text-center space-y-1">
                <h3 className="text-lg font-semibold">No repositories yet</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Connect your first repository to begin monitoring agent
                  architectures and gravitational patterns.
                </p>
              </div>
              <Button
                onClick={() => setAddDialogOpen(true)}
                data-testid="button-connect-first-repo"
              >
                <Plus className="w-4 h-4" />
                Connect your first repository
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent data-testid="dialog-add-repo">
          <DialogHeader>
            <DialogTitle>Add Repository</DialogTitle>
            <DialogDescription>
              Enter the repository in owner/name format (e.g. facebook/react)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="owner/name"
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddRepo()}
              data-testid="input-repo-name"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddDialogOpen(false)}
              data-testid="button-cancel-add-repo"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddRepo}
              disabled={adding || !repoInput}
              data-testid="button-submit-add-repo"
            >
              {adding && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              Add Repository
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
