import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Eye,
  EyeOff,
  Check,
  X,
  Loader2,
  GitBranch,
  Activity,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertSettingsSchema } from "@shared/schema";
import type { Settings } from "@shared/schema";
import { z } from "zod";

const settingsFormSchema = insertSettingsSchema.extend({
  githubPat: z.string().optional().nullable(),
  aiProvider: z.string().optional().nullable(),
  aiApiKey: z.string().optional().nullable(),
  aiModel: z.string().optional().nullable(),
});

type SettingsFormValues = z.infer<typeof settingsFormSchema>;

const modelDefaults: Record<string, string> = {
  openai: "gpt-4o",
  anthropic: "claude-sonnet-4-20250514",
  google: "gemini-2.0-flash",
};

export default function SettingsPage() {
  const { toast } = useToast();
  const [showPat, setShowPat] = useState(false);
  const [showAiKey, setShowAiKey] = useState(false);
  const [githubTestStatus, setGithubTestStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [aiTestStatus, setAiTestStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      githubPat: "",
      aiProvider: "",
      aiApiKey: "",
      aiModel: "",
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        githubPat: settings.githubPat ? "••••••••" : "",
        aiProvider: settings.aiProvider || "",
        aiApiKey: settings.aiApiKey ? "••••••••" : "",
        aiModel: settings.aiModel || "",
      });
    }
  }, [settings, form]);

  const selectedProvider = form.watch("aiProvider");

  useEffect(() => {
    if (selectedProvider && modelDefaults[selectedProvider]) {
      const currentModel = form.getValues("aiModel");
      if (
        !currentModel ||
        Object.values(modelDefaults).includes(currentModel)
      ) {
        form.setValue("aiModel", modelDefaults[selectedProvider]);
      }
    }
  }, [selectedProvider, form]);

  const saveGithubMutation = useMutation({
    mutationFn: async (data: Partial<SettingsFormValues>) => {
      const res = await apiRequest("PUT", "/api/settings", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "GitHub settings saved" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save settings",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const saveAiMutation = useMutation({
    mutationFn: async (data: Partial<SettingsFormValues>) => {
      const res = await apiRequest("PUT", "/api/settings", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "AI settings saved" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save settings",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleTestGithub = async () => {
    setGithubTestStatus("loading");
    try {
      await apiRequest("GET", "/api/settings/test-github");
      setGithubTestStatus("success");
    } catch {
      setGithubTestStatus("error");
    }
  };

  const handleTestAi = async () => {
    setAiTestStatus("loading");
    try {
      await apiRequest("GET", "/api/settings/test-ai");
      setAiTestStatus("success");
    } catch {
      setAiTestStatus("error");
    }
  };

  const handleSaveGithub = () => {
    const pat = form.getValues("githubPat");
    if (pat === "••••••••") return;
    saveGithubMutation.mutate({ githubPat: pat });
  };

  const handleSaveAi = () => {
    const aiApiKey = form.getValues("aiApiKey");
    saveAiMutation.mutate({
      aiProvider: form.getValues("aiProvider"),
      aiApiKey: aiApiKey === "••••••••" ? undefined : aiApiKey,
      aiModel: form.getValues("aiModel"),
    });
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
          Configure your connections and API access
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
          <Card data-testid="card-github-settings">
            <CardHeader className="flex flex-row items-center gap-3 flex-wrap">
              <div className="flex items-center justify-center w-9 h-9 rounded-md bg-muted">
                <GitBranch className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-lg">GitHub Configuration</CardTitle>
                <CardDescription>
                  Connect your GitHub account with a Personal Access Token
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="githubPat"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Personal Access Token</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="relative flex-1 min-w-[200px]">
                          <Input
                            type={showPat ? "text" : "password"}
                            placeholder="ghp_xxxxxxxxxxxx"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-github-pat"
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="absolute right-0 top-0"
                            onClick={() => setShowPat(!showPat)}
                            data-testid="button-toggle-pat-visibility"
                          >
                            {showPat ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestGithub}
                  disabled={githubTestStatus === "loading"}
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
                <Button
                  type="button"
                  onClick={handleSaveGithub}
                  disabled={saveGithubMutation.isPending}
                  data-testid="button-save-github"
                >
                  {saveGithubMutation.isPending && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  Save
                </Button>
                {githubTestStatus === "success" && (
                  <span className="text-sm text-green-500">
                    Connection successful
                  </span>
                )}
                {githubTestStatus === "error" && (
                  <span className="text-sm text-red-500">
                    Connection failed
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-ai-settings">
            <CardHeader className="flex flex-row items-center gap-3 flex-wrap">
              <div className="flex items-center justify-center w-9 h-9 rounded-md bg-muted">
                <Activity className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-lg">
                  AI Provider Configuration
                </CardTitle>
                <CardDescription>
                  Set up your AI provider for architecture analysis
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="aiProvider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provider</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || ""}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-ai-provider">
                          <SelectValue placeholder="Select a provider" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI</SelectItem>
                        <SelectItem value="anthropic">Anthropic</SelectItem>
                        <SelectItem value="google">Google</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="aiApiKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API Key</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showAiKey ? "text" : "password"}
                          placeholder="Enter your API key"
                          {...field}
                          value={field.value || ""}
                          data-testid="input-ai-api-key"
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="absolute right-0 top-0"
                          onClick={() => setShowAiKey(!showAiKey)}
                          data-testid="button-toggle-ai-key-visibility"
                        >
                          {showAiKey ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="aiModel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Model</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Model name"
                        {...field}
                        value={field.value || ""}
                        data-testid="input-ai-model"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestAi}
                  disabled={aiTestStatus === "loading"}
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
                <Button
                  type="button"
                  onClick={handleSaveAi}
                  disabled={saveAiMutation.isPending}
                  data-testid="button-save-ai"
                >
                  {saveAiMutation.isPending && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  Save
                </Button>
                {aiTestStatus === "success" && (
                  <span className="text-sm text-green-500">
                    Connection successful
                  </span>
                )}
                {aiTestStatus === "error" && (
                  <span className="text-sm text-red-500">
                    Connection failed
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </form>
      </Form>
    </div>
  );
}
