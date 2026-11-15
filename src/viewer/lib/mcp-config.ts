import { useEffect, useState } from 'react';

/** What the dev server's /__blazon/mcp-config answers (format blazon-mcp-config, version 1). */
export interface McpClientConfig {
  client: string;
  title: string;
  built: boolean;
  note?: string;
  snippets: { kind: 'command' | 'json'; label: string; text: string }[];
}
export interface McpConfigData {
  brand: string;
  clients: McpClientConfig[];
}

/**
 * The config for each client, or null when there is none to show. Only `blazon dev` answers; a static site, and a server that
 * answers the page for any path, give no such JSON, and then the panel is not offered.
 */
export async function loadMcpConfig(): Promise<McpConfigData | null> {
  try {
    const response = await fetch('__blazon/mcp-config', { cache: 'no-store' });
    if (!response.ok) return null;
    const data = (await response.json()) as Partial<McpConfigData> & { format?: unknown; version?: unknown };
    if (data.format !== 'blazon-mcp-config' || data.version !== 1 || !Array.isArray(data.clients) || typeof data.brand !== 'string') return null;
    return data as McpConfigData;
  } catch {
    return null;
  }
}

export function useMcpConfig(): McpConfigData | null {
  const [config, setConfig] = useState<McpConfigData | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadMcpConfig().then((found) => {
      if (!cancelled) setConfig(found);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return config;
}
