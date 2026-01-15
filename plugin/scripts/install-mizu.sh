#!/bin/bash
# Check if mizu is installed, install if not
if ! command -v mizu &> /dev/null; then
  echo "Installing mizu CLI..."
  npm install -g @anthropic-ai/mizu-agent 2>/dev/null || \
  bun install -g @anthropic-ai/mizu-agent 2>/dev/null || \
  echo "Warning: Could not auto-install mizu. Install manually with: npm install -g @anthropic-ai/mizu-agent"
fi
exit 0
