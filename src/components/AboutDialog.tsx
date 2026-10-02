import { Github, Heart, Star, GitPullRequest, Bug } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AboutDialog({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            Open source &amp; community
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm text-muted-foreground">
          <p>
            Zedgerr is built with love and maintained in our spare time. We believe great bookkeeping software should be
            accessible to everyone — self-hosted, private, and free to run.
          </p>
          <p>
            If Zedgerr saves you time or money, consider giving back so we can keep it running and make it even better.
          </p>
          <div className="grid gap-2 pt-1">
            <a
              href="https://github.com/vMawk/Zedgerr"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg border px-4 py-3 hover:bg-accent transition-colors"
            >
              <Star className="h-4 w-4 text-yellow-500 shrink-0" />
              <div>
                <div className="font-medium text-foreground">Star on GitHub</div>
                <div className="text-xs">Help others discover Zedgerr</div>
              </div>
            </a>
            <a
              href="https://github.com/sponsors/vMawk"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg border px-4 py-3 hover:bg-accent transition-colors"
            >
              <Heart className="h-4 w-4 text-red-500 shrink-0" />
              <div>
                <div className="font-medium text-foreground">Sponsor the project</div>
                <div className="text-xs">Keep the lights on via GitHub Sponsors</div>
              </div>
            </a>
            <a
              href="https://github.com/vMawk/Zedgerr/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg border px-4 py-3 hover:bg-accent transition-colors"
            >
              <Bug className="h-4 w-4 text-blue-500 shrink-0" />
              <div>
                <div className="font-medium text-foreground">Report a bug or idea</div>
                <div className="text-xs">Open an issue on GitHub</div>
              </div>
            </a>
            <a
              href="https://github.com/vMawk/Zedgerr/pulls"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg border px-4 py-3 hover:bg-accent transition-colors"
            >
              <GitPullRequest className="h-4 w-4 text-green-500 shrink-0" />
              <div>
                <div className="font-medium text-foreground">Contribute</div>
                <div className="text-xs">Open a pull request — all help is welcome</div>
              </div>
            </a>
          </div>
        </div>
        <div className="pt-2">
          <Button variant="outline" className="w-full" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
