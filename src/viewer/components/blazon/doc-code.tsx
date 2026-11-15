import { useEffect, useState } from 'react';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { CodeBlock, CodeBlockActions, CodeBlockContent, CodeBlockHeader, CodeBlockTitle } from '@/components/ui/code-block';

/** Copies with the clipboard API, or with a hidden textarea where the page cannot use it (plain http, an old browser). */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the textarea
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(area);
    area.select();
    const done = document.execCommand('copy');
    area.remove();
    return done;
  } catch {
    return false;
  }
}

/** A fenced code block of a guideline page: the language in the header, a copy button beside it. */
export function DocCode({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  const text = code.replace(/\n$/, '');

  return (
    <CodeBlock className="not-prose my-4 bg-muted/40 print:break-inside-avoid">
      <CodeBlockHeader>
        <CodeBlockTitle className="font-mono text-xs font-normal text-muted-foreground">{language || 'text'}</CodeBlockTitle>
        <CodeBlockActions>
          <Button
            variant="ghost"
            size="xs"
            aria-label={copied ? 'Copied' : 'Copy'}
            onClick={() => void copyText(text).then((ok) => (ok ? setCopied(true) : toast.add({ title: 'Copy failed', type: 'error' })))}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </CodeBlockActions>
      </CodeBlockHeader>
      <CodeBlockContent>{text}</CodeBlockContent>
    </CodeBlock>
  );
}
