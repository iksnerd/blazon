import { PlugIcon } from 'lucide-react';
import { useMcpConfig } from '@/lib/mcp-config';
import { Button } from '@/components/ui/button';
import { CodeBlock, CodeBlockContent, CodeBlockCopyButton, CodeBlockHeader, CodeBlockTitle } from '@/components/ui/code-block';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * "Connect your agent": the config that registers blazon-mcp in each client, for this project's folder. The dev server provides it
 * (/__blazon/mcp-config); a static site has no such answer, and then nothing is shown.
 */
export function ConnectAgent() {
  const config = useMcpConfig();
  if (!config) return null;
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" size="sm" className="hidden md:inline-flex" />}>
        <PlugIcon />
        Connect your agent
      </DialogTrigger>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Connect your agent</DialogTitle>
          <DialogDescription>
            blazon-mcp lets a coding agent ask blazon about this brand as tool calls. Paste one of these into your client. Nothing is written for you. The brand folder is{' '}
            <code className="font-mono text-[0.9em]">{config.brand}</code>. The server runs no plugin, but what the brand says reaches your agent as tool results, so use a folder
            you trust.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue={config.clients[0]?.client}>
          <TabsList className="h-auto flex-wrap">
            {config.clients.map((c) => (
              <TabsTrigger key={c.client} value={c.client}>
                {c.title}
              </TabsTrigger>
            ))}
          </TabsList>
          {config.clients.map((c) => (
            <TabsContent key={c.client} value={c.client} className="mt-3 flex flex-col gap-3">
              {c.note && <p className="text-[13px] text-muted-foreground">{c.note}</p>}
              {c.snippets.map((snippet) => (
                <CodeBlock key={snippet.label} size="sm">
                  <CodeBlockHeader>
                    <CodeBlockTitle>{snippet.label}</CodeBlockTitle>
                    <CodeBlockCopyButton value={snippet.text} />
                  </CodeBlockHeader>
                  <CodeBlockContent wrap>{snippet.text}</CodeBlockContent>
                </CodeBlock>
              ))}
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
