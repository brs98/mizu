import { useState, useEffect } from "react";
import { api } from "../lib/api";
import type { Repo } from "../hooks/useRepos";
import type { StartAgentOptions, AgentType } from "../hooks/useAgents";

interface Worktree {
  path: string;
  branch: string;
  commit: string;
  isMain: boolean;
  name: string;
  repoId: number;
  repoName: string;
  agentStatus: "idle" | "running" | "completed" | "failed";
  agentType?: AgentType;
  agentId?: string;
}

interface WorktreeListProps {
  selectedRepoId: number | null;
  repos: Repo[];
  onStartAgent: (options: StartAgentOptions) => Promise<unknown>;
  onBack: () => void;
}

export function WorktreeList({ selectedRepoId, repos, onStartAgent, onBack }: WorktreeListProps) {
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingAgent, setStartingAgent] = useState<string | null>(null);
  const [showStartModal, setShowStartModal] = useState<Worktree | null>(null);

  useEffect(() => {
    async function fetchWorktrees() {
      try {
        setLoading(true);
        const url = selectedRepoId
          ? `/api/worktrees/repo/${selectedRepoId}`
          : "/api/worktrees";
        const data = await api.get<{ worktrees: Worktree[] }>(url);
        setWorktrees(data.worktrees);
      } catch (err) {
        console.error("Failed to fetch worktrees:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchWorktrees();
  }, [selectedRepoId]);

  const selectedRepo = repos.find((r) => r.id === selectedRepoId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading worktrees...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground"
          >
            ← Back
          </button>
          <h2 className="text-2xl font-semibold">
            {selectedRepo ? selectedRepo.name : "All"} Worktrees
          </h2>
        </div>
      </div>

      {worktrees.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <p className="text-muted-foreground">No worktrees found.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {worktrees.map((wt) => (
            <div
              key={wt.path}
              className="bg-card border border-border rounded-lg p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{wt.branch}</h3>
                    {wt.isMain && (
                      <span className="px-2 py-0.5 text-xs bg-primary/10 text-primary rounded">
                        main
                      </span>
                    )}
                    <StatusBadge status={wt.agentStatus} type={wt.agentType} />
                  </div>
                  <p className="text-sm text-muted-foreground font-mono mt-1">
                    {wt.path}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {wt.repoName} • {wt.commit?.slice(0, 7)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {wt.agentStatus === "running" ? (
                    <span className="text-sm text-muted-foreground">
                      Agent running...
                    </span>
                  ) : (
                    <button
                      onClick={() => setShowStartModal(wt)}
                      disabled={startingAgent === wt.path}
                      className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                    >
                      Start Agent
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Start Agent Modal */}
      {showStartModal && (
        <StartAgentModal
          worktree={showStartModal}
          allWorktrees={worktrees}
          onClose={() => setShowStartModal(null)}
          onStart={async (options) => {
            setStartingAgent(showStartModal.path);
            try {
              await onStartAgent(options);
              setShowStartModal(null);
            } finally {
              setStartingAgent(null);
            }
          }}
        />
      )}
    </div>
  );
}

function StatusBadge({ status, type }: { status: string; type?: string }) {
  const colors: Record<string, string> = {
    idle: "bg-muted text-muted-foreground",
    running: "bg-green-500/10 text-green-600",
    completed: "bg-blue-500/10 text-blue-600",
    failed: "bg-destructive/10 text-destructive",
  };

  if (status === "idle") return null;

  return (
    <span className={`px-2 py-0.5 text-xs rounded ${colors[status]}`}>
      {type && `${type} `}{status}
    </span>
  );
}

interface StartAgentModalProps {
  worktree: Worktree;
  allWorktrees: Worktree[];
  onClose: () => void;
  onStart: (options: StartAgentOptions) => Promise<void>;
}

function StartAgentModal({ worktree, allWorktrees, onClose, onStart }: StartAgentModalProps) {
  const [type, setType] = useState<AgentType>("feature");
  const [specText, setSpecText] = useState("");
  const [referencePaths, setReferencePaths] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agentTypes: AgentType[] = ["bugfix", "feature", "refactor", "builder", "migrator", "scaffold"];

  // Get other worktrees for reference paths
  const otherWorktrees = allWorktrees.filter((wt) => wt.path !== worktree.path);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!specText.trim()) {
      setError("Specification is required");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await onStart({
        type,
        worktreePath: worktree.path,
        repoId: worktree.repoId,
        specText: specText.trim(),
        referencePaths: referencePaths.length > 0 ? referencePaths : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start agent");
      setSubmitting(false);
    }
  };

  const toggleReferencePath = (path: string) => {
    setReferencePaths((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-card border border-border rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-semibold mb-4">Start Agent</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Starting in: <span className="font-mono">{worktree.path}</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Agent Type</label>
            <div className="grid grid-cols-3 gap-2">
              {agentTypes.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`px-3 py-2 text-sm rounded-md border transition-colors ${
                    type === t
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Specification</label>
            <textarea
              value={specText}
              onChange={(e) => setSpecText(e.target.value)}
              placeholder={
                type === "bugfix"
                  ? "Paste error message or describe the bug..."
                  : type === "feature"
                  ? "Describe the feature to implement..."
                  : type === "refactor"
                  ? "Describe what to refactor..."
                  : "Describe what to build..."
              }
              rows={6}
              className="w-full px-3 py-2 border border-input rounded-md bg-background font-mono text-sm"
              required
            />
          </div>

          {otherWorktrees.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Reference Paths (optional)
              </label>
              <p className="text-xs text-muted-foreground mb-2">
                Select other worktrees the agent can read for reference.
              </p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {otherWorktrees.map((wt) => (
                  <label
                    key={wt.path}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={referencePaths.includes(wt.path)}
                      onChange={() => toggleReferencePath(wt.path)}
                      className="rounded border-input"
                    />
                    <span className="font-mono text-muted-foreground truncate">
                      {wt.branch} ({wt.repoName})
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && <div className="text-destructive text-sm">{error}</div>}

          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? "Starting..." : "Start Agent"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
