import { useState } from 'react';
import type { BlazonData, TokenItem } from '../../types/index.js';
import { search } from '@/lib/brand';
import { copy } from '@/lib/copy';
import { GUTTER, PageFooter, PageHeader } from '@/components/blazon/page';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ColorBadge } from '@/components/blazon/color-badge';
import { TokenPath } from '@/components/blazon/token-path';
import { ColorText } from '@/components/blazon/color-text';

/** A color or gradient is a badge in its own color; any other value is text. */
function TokenValue({ token }: { token: TokenItem }) {
  return token.type === 'color' || token.type === 'gradient' ? <ColorBadge paint={String(token.value)} /> : <ColorText text={String(token.value)} />;
}

/** Every token: a table where there is room, a list of cards on a phone so no column scrolls out of view. */
function TokenTable({ tokens }: { tokens: TokenItem[] }) {
  return (
    <div className={GUTTER}>
      <ul aria-label="Tokens" className="flex flex-col md:hidden">
        {tokens.map((token) => (
          <li key={token.path} data-token={token.path} className="flex flex-col gap-1 border-b py-3">
            <TokenPath path={token.path} />
            <span className="flex items-center gap-2 text-sm [overflow-wrap:anywhere]">
              <TokenValue token={token} />
            </span>
            <span className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
              <Button variant="link" size="sm" className="h-auto px-0 font-mono text-xs" onClick={() => copy(`var(${token.cssVariable})`)}>
                {token.cssVariable}
              </Button>
              {token.type ?? 'none'}
            </span>
          </li>
        ))}
      </ul>
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead>Token</TableHead>
            <TableHead>Value</TableHead>
            <TableHead>CSS variable</TableHead>
            <TableHead>Type</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tokens.map((token) => (
            <TableRow key={token.path} data-token={token.path}>
              <TableCell>
                <code className="font-mono text-xs">{token.path}</code>
              </TableCell>
              <TableCell className="whitespace-normal">
                <span className="flex items-center gap-2">
                  <TokenValue token={token} />
                </span>
              </TableCell>
              <TableCell>
                <Button variant="link" size="sm" className="h-auto px-0 font-mono text-xs" onClick={() => copy(`var(${token.cssVariable})`)}>
                  {token.cssVariable}
                </Button>
              </TableCell>
              <TableCell>{token.type ?? 'none'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function TokensPage({ data }: { data: BlazonData }) {
  const all = data.tokens.items;
  const [type, setType] = useState('');
  const [group, setGroup] = useState('');
  const types = [...new Set(all.map((t) => t.type ?? 'none'))].sort();
  const groups = [...new Set(all.map((t) => t.group))];
  const tokens = all.filter((t) => (!type || (t.type ?? 'none') === type) && (!group || t.group === group));
  const filtered = Boolean(type || group);

  return (
    <>
      <PageHeader label="Tokens" title="All tokens" intro={`${all.length} tokens. Click a variable to copy it.`}>
        <div className="mt-6 flex flex-wrap items-center gap-3 text-[13px]">
          <NativeSelect size="sm" aria-label="Type" value={type} onChange={(e) => setType(e.target.value)}>
            <NativeSelectOption value="">All types</NativeSelectOption>
            {types.map((t) => (
              <NativeSelectOption key={t} value={t}>
                {t}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect size="sm" aria-label="Group" value={group} onChange={(e) => setGroup(e.target.value)}>
            <NativeSelectOption value="">All groups</NativeSelectOption>
            {groups.map((g) => (
              <NativeSelectOption key={g} value={g}>
                {g}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {filtered && (
            <span className="text-muted-foreground">
              {tokens.length} of {all.length} tokens
            </span>
          )}
        </div>
      </PageHeader>
      {tokens.length > 0 ? <TokenTable tokens={tokens} /> : <p className={`${GUTTER} py-10 text-muted-foreground`}>No tokens match these filters.</p>}
      <PageFooter title={data.title} trail="Tokens / All tokens" />
    </>
  );
}

export function SearchPage({ data, query }: { data: BlazonData; query: string }) {
  const { tokens, docs } = search(data, query);
  const title = `Search: ${query}`;
  return (
    <>
      <PageHeader label="Tokens" title={title} intro={`${tokens.length} tokens. Click a variable to copy it.`}>
        {docs.length > 0 && (
          <p className="mt-4 max-w-[40em] text-muted-foreground">
            Pages:{' '}
            {docs.map((doc, index) => (
              <span key={doc.slug}>
                {index > 0 && ', '}
                <a className="text-foreground underline underline-offset-2" href={`#doc/${doc.slug}`}>
                  {doc.title}
                </a>
              </span>
            ))}
          </p>
        )}
      </PageHeader>
      <TokenTable tokens={tokens} />
      <PageFooter title={data.title} trail={`Tokens / ${title}`} />
    </>
  );
}
