import { loadConfig } from '../../core/config/index.js';
import { DEFAULT_MCP_NAME, mcpServerName } from '../../core/mcp-config.js';

/**
 * The name `blazon mcp` registers the server under for this brand folder: from the brand's title (`mcpServerName`). `blazon` when the
 * folder has no config, or its config does not load: a config that is wrong half-way through an edit must not stop the command that prints
 * what registers the server.
 */
export async function brandServerName(folder: string): Promise<string> {
  try {
    return mcpServerName((await loadConfig(folder)).title);
  } catch {
    return DEFAULT_MCP_NAME;
  }
}
