/**
 * AI Agent Dashboard Server
 *
 * Hono-based API server for managing AI agents across multiple repos and worktrees.
 * Runs on a cloud VM (or locally) and provides:
 * - REST API for agent management
 * - WebSocket for real-time progress updates
 * - Static file serving for the React frontend
 *
 * Uses Bun native APIs throughout:
 * - bun:sqlite for database
 * - Bun.spawn for process management
 * - Bun.file for file operations
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { createBunWebSocket } from "hono/bun";
import type { Database } from "bun:sqlite";

import { reposRouter } from "./routes/repos";
import { worktreesRouter } from "./routes/worktrees";
import { agentsRouter } from "./routes/agents";
import { filesRouter } from "./routes/files";
import { initDatabase } from "./db";
import { AgentManager } from "./services/agent-runner";

// =============================================================================
// Types
// =============================================================================

type Variables = {
  db: Database;
  agentManager: AgentManager;
};

// =============================================================================
// App Setup
// =============================================================================

const app = new Hono<{ Variables: Variables }>();
const { upgradeWebSocket, websocket } = createBunWebSocket();

// Initialize database
const db = initDatabase();

// Initialize agent manager (singleton for process management)
const agentManager = new AgentManager();

// =============================================================================
// Middleware
// =============================================================================

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
    credentials: true,
  })
);

// Make db and agentManager available to routes
app.use("*", async (c, next) => {
  c.set("db", db);
  c.set("agentManager", agentManager);
  await next();
});

// =============================================================================
// API Routes
// =============================================================================

app.route("/api/repos", reposRouter);
app.route("/api/worktrees", worktreesRouter);
app.route("/api/agents", agentsRouter);
app.route("/api/files", filesRouter);

// Health check
app.get("/api/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// =============================================================================
// WebSocket for Real-Time Updates
// =============================================================================

interface WebSocketClient {
  id: string;
  ws: WebSocket;
  subscriptions: Set<string>; // agent IDs
}

const wsClients = new Map<string, WebSocketClient>();

app.get(
  "/ws",
  upgradeWebSocket((c) => {
    const clientId = crypto.randomUUID();

    return {
      onOpen(event, ws) {
        console.log(`[WS] Client connected: ${clientId}`);
        wsClients.set(clientId, {
          id: clientId,
          ws: ws.raw as WebSocket,
          subscriptions: new Set(),
        });
      },

      onMessage(event, ws) {
        try {
          const data = JSON.parse(event.data.toString());
          const client = wsClients.get(clientId);
          if (!client) return;

          switch (data.type) {
            case "subscribe":
              if (data.agentId) {
                client.subscriptions.add(data.agentId);
                console.log(
                  `[WS] Client ${clientId} subscribed to agent ${data.agentId}`
                );
              }
              break;

            case "unsubscribe":
              if (data.agentId) {
                client.subscriptions.delete(data.agentId);
                console.log(
                  `[WS] Client ${clientId} unsubscribed from agent ${data.agentId}`
                );
              }
              break;

            case "subscribe_all":
              // Subscribe to all agent updates
              client.subscriptions.add("*");
              console.log(`[WS] Client ${clientId} subscribed to all agents`);
              break;
          }
        } catch (err) {
          console.error("[WS] Failed to parse message:", err);
        }
      },

      onClose(event, ws) {
        console.log(`[WS] Client disconnected: ${clientId}`);
        wsClients.delete(clientId);
      },

      onError(event, ws) {
        console.error(`[WS] Error for client ${clientId}:`, event);
        wsClients.delete(clientId);
      },
    };
  })
);

// Broadcast function for agent updates
export function broadcastAgentUpdate(
  agentId: string,
  event: string,
  data: unknown
) {
  const message = JSON.stringify({ type: event, agentId, data });

  for (const client of wsClients.values()) {
    if (client.subscriptions.has(agentId) || client.subscriptions.has("*")) {
      try {
        client.ws.send(message);
      } catch (err) {
        console.error(`[WS] Failed to send to client ${client.id}:`, err);
      }
    }
  }
}

// Make broadcast available to agent manager
agentManager.setBroadcast(broadcastAgentUpdate);

// =============================================================================
// Static Files (Production)
// =============================================================================

if (process.env.NODE_ENV === "production") {
  app.use("/*", serveStatic({ root: "./dist/client" }));
  // SPA fallback
  app.get("*", serveStatic({ path: "./dist/client/index.html" }));
}

// =============================================================================
// Start Server
// =============================================================================

const port = parseInt(process.env.PORT || "3000", 10);

console.log(`
╔════════════════════════════════════════════════════════════════╗
║                   AI Agent Dashboard                            ║
╠════════════════════════════════════════════════════════════════╣
║  Server running at: http://localhost:${port}                     ║
║  API endpoints:     http://localhost:${port}/api                 ║
║  WebSocket:         ws://localhost:${port}/ws                    ║
╚════════════════════════════════════════════════════════════════╝
`);

export default {
  port,
  fetch: app.fetch,
  websocket,
};
