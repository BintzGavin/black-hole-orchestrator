import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  X,
  Loader2,
  GitBranch,
  Activity,
  Shield,
  FileCode,
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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Settings } from "@shared/schema";

export default function SettingsPage() {
  const { toast } = useToast();
  const [githubTestStatus, setGithubTestStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [githubUsername, setGithubUsername] = useState<string | null>(null);
  const [aiTestStatus, setAiTestStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  const handleTestGithub = async () => {
    setGithubTestStatus("loading");
    try {
      const res = await apiRequest("GET", "/api/settings/test-github");
      const data = await res.json();
      setGithubUsername(data.username);
      setGithubTestStatus("success");
      toast({ title: `Connected as ${data.username}` });
    } catch {
      setGithubTestStatus("error");
      toast({
        title: "GitHub connection failed",
        description: "Check your GITHUB_PAT in the .env file",
        variant: "destructive",
      });
    }
  };

  const handleTestAi = async () => {
    setAiTestStatus("loading");
    try {
      await apiRequest("GET", "/api/settings/test-ai");
      setAiTestStatus("success");
      toast({ title: "AI provider connection successful" });
    } catch {
      setAiTestStatus("error");
      toast({
        title: "AI connection failed",
        description: "Check your AI_API_KEY and AI_PROVIDER in the .env file",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-2xl">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl" data-testid="page-settings">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-settings-title">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Environment configuration status
        </p>
      </div>

      <Card data-testid="card-env-instructions">
        <CardHeader className="flex flex-row items-center gap-3 flex-wrap">
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-muted">
            <FileCode className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-lg">Configuration</CardTitle>
            <CardDescription>
              API keys are configured via environment variables in your <code className="text-xs bg-muted px-1 py-0.5 rounded">.env</code> file
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm space-y-1">
            <p className="text-muted-foreground"># .env</p>
            <p>GITHUB_PAT=ghp_your_token_here</p>
            <p>AI_PROVIDER=openai</p>
            <p>AI_API_KEY=sk-your_key_here</p>
            <p>AI_MODEL=gpt-4o</p>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-github-settings">
        <CardHeader className="flex flex-row items-center gap-3 flex-wrap">
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-muted">
            <GitBranch className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="space-y-1 flex-1">
            <CardTitle className="text-lg">GitHub</CardTitle>
            <CardDescription>
              Personal Access Token for repository access
            </CardDescription>
          </div>
          {settings?.githubPat ? (
            <Badge variant="default" className="bg-green-600" data-testid="badge-github-status">
              <Shield className="w-3 h-3 mr-1" />
              Configured
            </Badge>
          ) : (
            <Badge variant="destructive" data-testid="badge-github-status">
              Not Configured
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {settings?.githubPat && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Token:</span>
              <code className="bg-muted px-2 py-0.5 rounded" data-testid="text-github-pat">
                {settings.githubPat}
              </code>
            </div>
          )}

          {githubUsername && githubTestStatus === "success" && (
            <div className="flex items-center gap-2 text-sm text-green-500">
              <Check className="w-4 h-4" />
              Authenticated as <strong>{githubUsername}</strong>
            </div>
          )}

          <Separator />

          <div className="flex items-center gap-3 flex-wrap">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestGithub}
              disabled={githubTestStatus === "loading" || !settings?.githubPat}
              data-testid="button-test-github"
            >
              {githubTestStatus === "loading" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : githubTestStatus === "success" ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : githubTestStatus === "error" ? (
                <X className="w-4 h-4 text-red-500" />
              ) : null}
              Test Connection
            </Button>
            {githubTestStatus === "success" && (
              <span className="text-sm text-green-500">Connection successful</span>
            )}
            {githubTestStatus === "error" && (
              <span className="text-sm text-red-500">Connection failed — check GITHUB_PAT</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-ai-settings">
        <CardHeader className="flex flex-row items-center gap-3 flex-wrap">
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-muted">
            <Activity className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="space-y-1 flex-1">
            <CardTitle className="text-lg">AI Provider</CardTitle>
            <CardDescription>
              AI model for architecture analysis
            </CardDescription>
          </div>
          {settings?.aiApiKey ? (
            <Badge variant="default" className="bg-green-600" data-testid="badge-ai-status">
              <Shield className="w-3 h-3 mr-1" />
              Configured
            </Badge>
          ) : (
            <Badge variant="destructive" data-testid="badge-ai-status">
              Not Configured
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground mb-1">Provider</p>
              <p className="font-medium capitalize" data-testid="text-ai-provider">
                {settings?.aiProvider || "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Model</p>
              <p className="font-medium" data-testid="text-ai-model">
                {settings?.aiModel || "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">API Key</p>
              <code className="bg-muted px-2 py-0.5 rounded text-xs" data-testid="text-ai-key">
                {settings?.aiApiKey || "—"}
              </code>
            </div>
          </div>

          <Separator />

          <div className="flex items-center gap-3 flex-wrap">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestAi}
              disabled={aiTestStatus === "loading" || !settings?.aiApiKey}
              data-testid="button-test-ai"
            >
              {aiTestStatus === "loading" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : aiTestStatus === "success" ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : aiTestStatus === "error" ? (
                <X className="w-4 h-4 text-red-500" />
              ) : null}
              Test Connection
            </Button>
            {aiTestStatus === "success" && (
              <span className="text-sm text-green-500">Connection successful</span>
            )}
            {aiTestStatus === "error" && (
              <span className="text-sm text-red-500">Connection failed — check AI_API_KEY</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
