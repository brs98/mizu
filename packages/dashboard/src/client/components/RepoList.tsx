import { useState } from "react";
import type { Repo } from "../hooks/useRepos";

interface RepoListProps {
  repos: Repo[];
  loading: boolean;
  onAdd: (path: string, name?: string) => Promise<Repo>;
  onRemove: (id: number) => Promise<void>;
  onSelect: (id: number) => void;
}

export function RepoList({ repos, loading, onAdd, onRemove, onSelect }: RepoListProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPath.trim()) return;

    try {
      setAdding(true);
      setAddError(null);
      await onAdd(newPath.trim(), newName.trim() || undefined);
      setNewPath("");
      setNewName("");
      setShowAddForm(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add repository");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: number, name: string) => {
    if (!confirm(`Remove "${name}" from the dashboard? (This won't delete the repository)`)) {
      return;
    }
    try {
      await onRemove(id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to remove repository");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading repositories...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Repositories</h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
        >
          {showAddForm ? "Cancel" : "Add Repository"}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAdd} className="bg-card border border-border rounded-lg p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Repository Path</label>
            <input
              type="text"
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              placeholder="/path/to/your/repo"
              className="w-full px-3 py-2 border border-input rounded-md bg-background"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Display Name (optional)</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="my-project"
              className="w-full px-3 py-2 border border-input rounded-md bg-background"
            />
          </div>
          {addError && (
            <div className="text-destructive text-sm">{addError}</div>
          )}
          <button
            type="submit"
            disabled={adding}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {adding ? "Adding..." : "Add Repository"}
          </button>
        </form>
      )}

      {repos.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <p className="text-muted-foreground">No repositories added yet.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Add a repository to start managing AI agents.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {repos.map((repo) => (
            <div
              key={repo.id}
              className="bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <button
                  onClick={() => onSelect(repo.id)}
                  className="text-left flex-1"
                >
                  <h3 className="font-semibold text-lg">{repo.name}</h3>
                  <p className="text-sm text-muted-foreground font-mono mt-1">
                    {repo.path}
                  </p>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onSelect(repo.id)}
                    className="px-3 py-1 text-sm bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80"
                  >
                    View Worktrees
                  </button>
                  <button
                    onClick={() => handleRemove(repo.id, repo.name)}
                    className="px-3 py-1 text-sm text-destructive hover:bg-destructive/10 rounded-md"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
