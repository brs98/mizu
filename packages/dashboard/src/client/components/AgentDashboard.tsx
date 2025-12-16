import { useState, useEffect } from "react";
import type { Agent } from "../hooks/useAgents";
import type { WebSocketMessage } from "../hooks/useWebSocket";

interface AgentDashboardProps {
  agents: Agent[];
  runningAgents: Agent[];
  onStop: (id: string) => Promise<void>;
  messages: WebSocketMessage[];
}

export function AgentDashboard({ agents, runningAgents, onStop, messages }: AgentDashboardProps) {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [agentProgress, setAgentProgress] = useState<Record<string, Agent["progress"]>>({});
  const [stoppingAgent, setStoppingAgent] = useState<string | null>(null);

  // Update progress from WebSocket messages
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.type === "agent:progress" && lastMessage.agentId) {
      setAgentProgress((prev) => ({
        ...prev,
        [lastMessage.agentId!]: lastMessage.data as Agent["progress"],
      }));
    }
  }, [messages]);

  const handleStop = async (id: string) => {
    if (!confirm("Stop this agent?")) return;
    try {
      setStoppingAgent(id);
      await onStop(id);
    } finally {
      setStoppingAgent(null);
    }
  };

  // Get recent completed/failed agents
  const completedAgents = agents.filter(
    (a) => a.status === "completed" || a.status === "failed" || a.status === "stopped"
  ).slice(0, 10);

  return (
    <div className="space-y-8">
      {/* Running Agents */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">
          Running Agents ({runningAgents.length})
        </h2>

        {runningAgents.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <p className="text-muted-foreground">No agents currently running.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Go to Worktrees to start a new agent.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {runningAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                progress={agentProgress[agent.id] || agent.progress}
                onStop={() => handleStop(agent.id)}
                stopping={stoppingAgent === agent.id}
                onSelect={() => setSelectedAgent(agent.id)}
                selected={selectedAgent === agent.id}
              />
            ))}
          </div>
        )}
      </section>

      {/* Recent Completed */}
      {completedAgents.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4">Recent</h2>
          <div className="space-y-2">
            {completedAgents.map((agent) => (
              <CompletedAgentRow key={agent.id} agent={agent} />
            ))}
          </div>
        </section>
      )}

      {/* Log Panel for selected agent */}
      {selectedAgent && (
        <LogPanel
          agentId={selectedAgent}
          messages={messages.filter((m) => m.agentId === selectedAgent)}
          onClose={() => setSelectedAgent(null)}
        />
      )}
    </div>
  );
}

interface AgentCardProps {
  agent: Agent;
  progress?: Agent["progress"];
  onStop: () => void;
  stopping: boolean;
  onSelect: () => void;
  selected: boolean;
}

function AgentCard({ agent, progress, onStop, stopping, onSelect, selected }: AgentCardProps) {
  const progressPercent = progress
    ? Math.round((progress.completed / progress.total) * 100) || 0
    : 0;

  return (
    <div
      className={`bg-card border rounded-lg p-4 transition-colors ${
        selected ? "border-primary" : "border-border hover:border-primary/50"
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="font-semibold">{agent.agent_type}</span>
          </div>
          <p className="text-sm text-muted-foreground font-mono mt-1 truncate max-w-[300px]">
            {agent.worktree_path.split("/").slice(-2).join("/")}
          </p>
        </div>
        <button
          onClick={onStop}
          disabled={stopping}
          className="px-3 py-1 text-sm text-destructive hover:bg-destructive/10 rounded-md disabled:opacity-50"
        >
          {stopping ? "Stopping..." : "Stop"}
        </button>
      </div>

      {/* Progress Bar */}
      {progress && progress.total > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Task {progress.completed + progress.inProgress}/{progress.total}
            </span>
            <span className="font-medium">{progressPercent}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {progress.currentTask && (
            <p className="text-xs text-muted-foreground truncate">
              {progress.currentTask}
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
        <span className="text-xs text-muted-foreground">
          Started {formatTime(agent.started_at)}
        </span>
        <button
          onClick={onSelect}
          className="text-xs text-primary hover:underline"
        >
          {selected ? "Hide Logs" : "View Logs"}
        </button>
      </div>
    </div>
  );
}

function CompletedAgentRow({ agent }: { agent: Agent }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 bg-card border border-border rounded-md">
      <div className="flex items-center gap-3">
        <StatusIcon status={agent.status} />
        <div>
          <span className="font-medium">{agent.agent_type}</span>
          <span className="text-muted-foreground mx-2">•</span>
          <span className="text-sm text-muted-foreground font-mono">
            {agent.worktree_path.split("/").slice(-2).join("/")}
          </span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground">
        {formatTime(agent.completed_at || agent.started_at)}
      </span>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <span className="text-green-500">✓</span>;
    case "failed":
      return <span className="text-destructive">✗</span>;
    case "stopped":
      return <span className="text-yellow-500">⏹</span>;
    default:
      return null;
  }
}

interface LogPanelProps {
  agentId: string;
  messages: WebSocketMessage[];
  onClose: () => void;
}

function LogPanel({ agentId, messages, onClose }: LogPanelProps) {
  const logs = messages
    .filter((m) => m.type === "agent:log")
    .map((m) => (m.data as { text: string; stream: string }));

  return (
    <div className="fixed bottom-0 left-0 right-0 h-64 bg-card border-t border-border">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="font-medium text-sm">Agent Logs</span>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
      </div>
      <div className="h-[calc(100%-40px)] overflow-y-auto p-4 font-mono text-xs">
        {logs.length === 0 ? (
          <span className="text-muted-foreground">Waiting for output...</span>
        ) : (
          logs.map((log, i) => (
            <div
              key={i}
              className={log.stream === "stderr" ? "text-destructive" : ""}
            >
              {log.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return date.toLocaleDateString();
}
