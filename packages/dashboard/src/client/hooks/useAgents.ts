import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";

export type AgentType =
  | "bugfix"
  | "feature"
  | "refactor"
  | "builder"
  | "migrator"
  | "scaffold";

export interface Agent {
  id: string;
  repo_id?: number;
  worktree_path: string;
  agent_type: AgentType;
  status: "running" | "completed" | "failed" | "stopped";
  spec_text?: string;
  spec_file?: string;
  started_at: string;
  completed_at?: string;
  pid?: number;
  progress?: {
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    currentTask?: string;
  };
}

export interface StartAgentOptions {
  type: AgentType;
  worktreePath: string;
  repoId?: number;
  specText?: string;
  specFile?: string;
  referencePaths?: string[];
  model?: string;
  maxSessions?: number;
}

export function useAgents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get<{ agents: Agent[] }>("/api/agents");
      setAgents(data.agents);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch agents");
    } finally {
      setLoading(false);
    }
  }, []);

  const startAgent = useCallback(async (options: StartAgentOptions) => {
    try {
      const data = await api.post<{ agent: Agent }>("/api/agents", options);
      setAgents((prev) => [data.agent, ...prev]);
      return data.agent;
    } catch (err) {
      throw err instanceof Error ? err : new Error("Failed to start agent");
    }
  }, []);

  const stopAgent = useCallback(async (id: string) => {
    try {
      await api.post(`/api/agents/${id}/stop`, {});
      setAgents((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: "stopped" as const } : a))
      );
    } catch (err) {
      throw err instanceof Error ? err : new Error("Failed to stop agent");
    }
  }, []);

  const resumeAgent = useCallback(
    async (id: string, model?: string, maxSessions?: number) => {
      try {
        const data = await api.post<{ agent: Agent }>(`/api/agents/${id}/resume`, {
          model,
          maxSessions,
        });
        setAgents((prev) => [data.agent, ...prev]);
        return data.agent;
      } catch (err) {
        throw err instanceof Error ? err : new Error("Failed to resume agent");
      }
    },
    []
  );

  const getAgentProgress = useCallback(async (id: string) => {
    try {
      const data = await api.get<{ progress: Agent["progress"] }>(
        `/api/agents/${id}/progress`
      );
      return data.progress;
    } catch (err) {
      return null;
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // Filter running agents
  const runningAgents = agents.filter((a) => a.status === "running");

  return {
    agents,
    runningAgents,
    loading,
    error,
    startAgent,
    stopAgent,
    resumeAgent,
    getAgentProgress,
    refresh: fetchAgents,
  };
}
