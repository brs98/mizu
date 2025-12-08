/**
 * Prompt Loading Utilities
 *
 * Functions for loading and templating prompt files.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Load a prompt template from a file
 */
export function loadPrompt(promptPath: string): string {
  if (!existsSync(promptPath)) {
    throw new Error(`Prompt file not found: ${promptPath}`);
  }
  return readFileSync(promptPath, "utf-8");
}

/**
 * Simple template rendering for prompts
 *
 * Supports:
 * - {{ variable }} - variable substitution
 * - {% if variable == "value" %}...{% endif %} - conditionals
 * - {% if variable == "value" %}...{% else %}...{% endif %} - if/else
 */
export function renderPrompt(
  template: string,
  context: Record<string, string | number | boolean>
): string {
  let result = template;

  // Handle if/else blocks
  const ifElsePattern = /\{%\s*if\s+(\w+)\s*==\s*["'](\w+)["']\s*%\}([\s\S]*?)\{%\s*else\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
  result = result.replace(ifElsePattern, (_match, varName, varValue, ifContent, elseContent) => {
    const actualValue = String(context[varName] ?? "");
    return actualValue === varValue ? ifContent.trim() : elseContent.trim();
  });

  // Handle simple if blocks
  const ifPattern = /\{%\s*if\s+(\w+)\s*==\s*["'](\w+)["']\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
  result = result.replace(ifPattern, (_match, varName, varValue, content) => {
    const actualValue = String(context[varName] ?? "");
    return actualValue === varValue ? content.trim() : "";
  });

  // Handle variable substitution
  const varPattern = /\{\{\s*(\w+)\s*\}\}/g;
  result = result.replace(varPattern, (_match, varName) => {
    return String(context[varName] ?? "");
  });

  return result;
}

/**
 * Load a prompt template and render it with context
 */
export function loadAndRenderPrompt(
  promptPath: string,
  context: Record<string, string | number | boolean>
): string {
  const template = loadPrompt(promptPath);
  return renderPrompt(template, context);
}

/**
 * Get the prompts directory for an agent
 */
export function getPromptsDir(agentDir: string): string {
  return join(agentDir, "prompts");
}
