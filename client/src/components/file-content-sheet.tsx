import { useState, useCallback, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText, Loader2, ExternalLink, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";

interface FileContentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filePath: string | null;
  fileType: string | null;
  repoOwner: string;
  repoName: string;
  repoBranch: string;
  onBack?: () => void;
}

export function FileContentSheet({
  open,
  onOpenChange,
  filePath,
  fileType,
  repoOwner,
  repoName,
  repoBranch,
  onBack,
}: FileContentSheetProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch content when the sheet opens with a file path
  useEffect(() => {
    if (!open || !filePath) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent(null);

    (async () => {
      try {
        const res = await apiRequest("POST", "/api/github/file-content", {
          owner: repoOwner,
          name: repoName,
          path: filePath,
          branch: repoBranch,
        });
        const data = await res.json();
        if (!cancelled) setContent(data.content);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Failed to fetch file content");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, filePath, repoOwner, repoName, repoBranch]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setContent(null);
      setError(null);
    }
    onOpenChange(isOpen);
  };

  const fileName = filePath?.split("/").pop() || filePath || "";
  const githubUrl = `https://github.com/${repoOwner}/${repoName}/blob/${repoBranch}/${filePath}`;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl lg:max-w-3xl overflow-hidden flex flex-col"
      >
        <SheetHeader className="shrink-0 pr-8">
          {onBack && (
            <div className="mb-2">
              <Button variant="ghost" size="sm" onClick={onBack} className="-ml-3 h-8 text-muted-foreground">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Plans
              </Button>
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
            <SheetTitle className="text-base truncate">{fileName}</SheetTitle>
            {fileType && (
              <Badge variant="outline" className="text-xs shrink-0">
                {fileType}
              </Badge>
            )}
          </div>
          <SheetDescription className="flex items-center gap-2 text-xs">
            <span className="truncate">{filePath}</span>
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline shrink-0"
            >
              <ExternalLink className="w-3 h-3" />
              GitHub
            </a>
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 mt-4 -mx-6 px-6">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="py-8 text-center">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {content !== null && !loading && (
            <article className="prose prose-sm dark:prose-invert max-w-none pb-8 prose-headings:scroll-mt-4 prose-pre:bg-muted prose-pre:text-foreground prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
              </ReactMarkdown>
            </article>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
