import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";

export interface Repo {
  id: number;
  path: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export function useRepos() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRepos = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get<{ repos: Repo[] }>("/api/repos");
      setRepos(data.repos);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch repos");
    } finally {
      setLoading(false);
    }
  }, []);

  const addRepo = useCallback(async (path: string, name?: string) => {
    try {
      const data = await api.post<{ repo: Repo }>("/api/repos", { path, name });
      setRepos((prev) => [data.repo, ...prev]);
      return data.repo;
    } catch (err) {
      throw err instanceof Error ? err : new Error("Failed to add repo");
    }
  }, []);

  const removeRepo = useCallback(async (id: number) => {
    try {
      await api.delete(`/api/repos/${id}`);
      setRepos((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      throw err instanceof Error ? err : new Error("Failed to remove repo");
    }
  }, []);

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  return {
    repos,
    loading,
    error,
    addRepo,
    removeRepo,
    refresh: fetchRepos,
  };
}
