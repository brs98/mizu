import { useState, useEffect } from "react";
import { RepoList } from "./components/RepoList";
import { WorktreeList } from "./components/WorktreeList";
import { AgentDashboard } from "./components/AgentDashboard";
import { useWebSocket } from "./hooks/useWebSocket";
import { useRepos } from "./hooks/useRepos";
import { useAgents } from "./hooks/useAgents";

type View = "repos" | "worktrees" | "agents";

export default function App() {
  const [view, setView] = useState<View>("agents");
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);

  const { repos, loading: reposLoading, addRepo, removeRepo, refresh: refreshRepos } = useRepos();
  const { agents, runningAgents, startAgent, stopAgent, refresh: refreshAgents } = useAgents();
  const { connected, messages } = useWebSocket();

  // Auto-refresh agents when websocket receives updates
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.type === "agent:complete" || lastMessage.type === "agent:progress") {
        refreshAgents();
      }
    }
  }, [messages, refreshAgents]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-semibold">AI Agent Dashboard</h1>
              <div className="flex items-center gap-1 text-sm">
                <span
                  className={`w-2 h-2 rounded-full ${
                    connected ? "bg-green-500" : "bg-red-500"
                  }`}
                />
                <span className="text-muted-foreground">
                  {connected ? "Connected" : "Disconnected"}
                </span>
              </div>
            </div>

            {/* Navigation */}
            <nav className="flex gap-1">
              <button
                onClick={() => setView("agents")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  view === "agents"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                Agents ({runningAgents.length} running)
              </button>
              <button
                onClick={() => setView("worktrees")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  view === "worktrees"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                Worktrees
              </button>
              <button
                onClick={() => setView("repos")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  view === "repos"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                Repos ({repos.length})
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {view === "repos" && (
          <RepoList
            repos={repos}
            loading={reposLoading}
            onAdd={addRepo}
            onRemove={removeRepo}
            onSelect={(id) => {
              setSelectedRepoId(id);
              setView("worktrees");
            }}
          />
        )}

        {view === "worktrees" && (
          <WorktreeList
            selectedRepoId={selectedRepoId}
            repos={repos}
            onStartAgent={startAgent}
            onBack={() => setView("repos")}
          />
        )}

        {view === "agents" && (
          <AgentDashboard
            agents={agents}
            runningAgents={runningAgents}
            onStop={stopAgent}
            messages={messages}
          />
        )}
      </main>
    </div>
  );
}
