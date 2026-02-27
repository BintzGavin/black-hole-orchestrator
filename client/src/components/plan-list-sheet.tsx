import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { FileText, ChevronRight, GitPullRequest, ExternalLink } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AgentFile, ActivityEvent } from "@shared/schema";

interface PlanListSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: AgentFile[] | null;
  prEvents?: ActivityEvent[];
  repoOwner?: string;
  repoName?: string;
  onSelectFile: (file: AgentFile) => void;
  roleName?: string;
}

function formatPlanTitle(path: string) {
  const fileName = path.split("/").pop() || path;
  const nameWithoutExt = fileName.replace(/\.md$/, "");
  
  // Remove YYYY-MM-DD prefix if it exists
  const withoutDate = nameWithoutExt.replace(/^\d{4}-\d{2}-\d{2}-/, "");
  
  return withoutDate
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function PlanListSheet({ open, onOpenChange, files, prEvents = [], repoOwner, repoName, onSelectFile, roleName }: PlanListSheetProps) {
  if (!files) return null;

  const hasPrs = prEvents.length > 0;

  const sortedFiles = [...files].sort((a, b) => {
    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    return dateB - dateA;
  });

  const sortedPrs = [...prEvents].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const filesList = (
    <>
      {sortedFiles.map((file, i) => (
        <button
          key={i}
          onClick={() => {
            onSelectFile(file);
          }}
          className="w-full flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent hover:text-accent-foreground transition-colors text-left group"
        >
          <div className="flex items-start gap-3 overflow-hidden min-w-0">
            <FileText className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate group-hover:underline">
                {formatPlanTitle(file.path)}
              </p>
              <p className="text-xs text-muted-foreground truncate opacity-80 mt-0.5">
                {file.path.split("/").pop()}
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 ml-3 opacity-50 group-hover:opacity-100 transition-opacity" />
        </button>
      ))}
    </>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader className="shrink-0 mb-2">
          <SheetTitle>Activity {roleName ? `for ${roleName}` : ""}</SheetTitle>
          <SheetDescription>
            {files.length} plan{files.length === 1 ? "" : "s"}
            {hasPrs ? ` · ${prEvents.length} pull request${prEvents.length === 1 ? "" : "s"}` : ""}
          </SheetDescription>
        </SheetHeader>
        
        {hasPrs ? (
          <Tabs defaultValue="plans" className="flex-1 flex flex-col min-h-0">
            <div className="mb-2">
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="plans">Plans</TabsTrigger>
                <TabsTrigger value="prs">Pull Requests</TabsTrigger>
              </TabsList>
            </div>
            
            <ScrollArea className="flex-1 -mx-6 px-6">
              <TabsContent value="plans" className="mt-0 space-y-2 pb-8">
                {filesList}
              </TabsContent>
              <TabsContent value="prs" className="mt-0 space-y-2 pb-8">
                {sortedPrs.map((pr) => (
                  <a
                    key={pr.id}
                    href={`https://github.com/${repoOwner}/${repoName}/pull/${pr.prNumber}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent hover:text-accent-foreground transition-colors text-left group"
                  >
                    <div className="flex items-start gap-3 overflow-hidden min-w-0">
                      <GitPullRequest className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate group-hover:underline">
                          {pr.title}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground truncate opacity-80 mt-0.5">
                          <span>#{pr.prNumber}</span>
                          {pr.author && <span>by {pr.author}</span>}
                        </div>
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0 ml-3 opacity-50 group-hover:opacity-100 transition-opacity" />
                  </a>
                ))}
              </TabsContent>
            </ScrollArea>
          </Tabs>
        ) : (
          <ScrollArea className="flex-1 mt-2 -mx-6 px-6">
            <div className="space-y-2 pb-8">
              {filesList}
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}
