// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectAgent } from '../../src/viewer/components/blazon/connect-agent';

// The "Connect your agent" panel shows what the dev server's /__blazon/mcp-config gives it, and is absent when the site is static.

const CONFIG = {
  format: 'blazon-mcp-config',
  version: 1,
  brand: '/work/brand',
  clients: [
    { client: 'claude-code', title: 'Claude Code', built: true, snippets: [{ kind: 'command', label: 'Command', text: 'claude mcp add blazon' }] },
    {
      client: 'cursor',
      title: 'Cursor',
      built: false,
      note: 'the server file is missing; reinstall blazon',
      snippets: [{ kind: 'json', label: '.cursor/mcp.json', text: '{"mcpServers":{}}' }],
    },
  ],
};
const answer = (response: Response) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response),
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ConnectAgent', () => {
  it('offers the panel, with the brand folder and a tab for each client', async () => {
    answer(new Response(JSON.stringify(CONFIG), { headers: { 'content-type': 'application/json' } }));
    render(<ConnectAgent />);
    await userEvent.click(await screen.findByRole('button', { name: /Connect your agent/ }));
    expect(await screen.findByText('/work/brand')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Claude Code' })).toBeTruthy();
    expect(screen.getByText('claude mcp add blazon')).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: 'Cursor' }));
    expect(await screen.findByText('the server file is missing; reinstall blazon')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Copy' }).length).toBeGreaterThan(0);
  });

  it.each([
    ['a page for any path', new Response('<html></html>', { headers: { 'content-type': 'text/html' } })],
    ['a 404', new Response('no', { status: 404 })],
    ['another format', new Response(JSON.stringify({ format: 'x', version: 1 }))],
  ])('shows nothing when the site answers with %s', async (_name, response) => {
    answer(response);
    const { container } = render(<ConnectAgent />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });
});
