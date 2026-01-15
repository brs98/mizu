#!/bin/bash
# Setup mizu command in user's PATH

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"
MIZU_BIN="$PLUGIN_ROOT/bin/mizu"

# Ensure bin/mizu is executable
chmod +x "$MIZU_BIN" 2>/dev/null

# Create symlink in ~/.local/bin (common user bin directory)
mkdir -p ~/.local/bin
ln -sf "$MIZU_BIN" ~/.local/bin/mizu

# Check if ~/.local/bin is in PATH, add to CLAUDE_ENV_FILE if available
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
  if [ -n "$CLAUDE_ENV_FILE" ]; then
    echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
  fi
fi

exit 0
