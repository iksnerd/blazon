import type { BlazonData, TokenItem } from '../../types/index.js';
import { MOTION_TYPES } from '@/lib/brand';
import { byParent } from '@/lib/tokens/group';
import { lastSegment } from '@/lib/tokens/format';
import { controlPoints, curvePath } from '@/lib/tokens/motion';
import { Doc, PageFooter, PageHeader, Section } from '@/components/blazon/page';
import { TokenRow } from '@/components/blazon/token-row';

/** A dot that crosses its track and back, again and again, with the given timing. */
function Demo({ duration = '1s', timing = 'ease', delay = '0s' }: { duration?: string; timing?: string; delay?: string }) {
  return (
    <span className="relative block h-2 w-full rounded-full bg-muted">
      <span
        data-demo
        className="blazon-demo-slide absolute top-1/2 left-0 size-4 -translate-y-1/2 rounded-full bg-primary"
        style={{ animationDuration: duration, animationTimingFunction: timing, animationDelay: delay }}
      />
    </span>
  );
}

function Curve({ value, label }: { value: unknown; label: string }) {
  const points = controlPoints(value);
  if (!points) return <Demo timing={label} />;
  return (
    <svg role="img" aria-label={`Easing curve ${label}`} viewBox="-4 -4 108 108" className="size-12 overflow-visible">
      <rect x="0" y="0" width="100" height="100" className="fill-none stroke-border" strokeWidth="1" />
      <path d={curvePath(points)} className="fill-none stroke-primary" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function MotionRow({ token }: { token: TokenItem }) {
  const value = String(token.value);
  if (token.type === 'duration') return <TokenRow token={token} demo={<Demo duration={value} />} />;
  if (token.type === 'cubicBezier') return <TokenRow token={token} demo={<Curve value={token.resolvedValue} label={value} />} />;
  const parts = token.parts ?? {};
  const duration = String(parts.duration ?? '1s');
  const timing = String(parts.timingFunction ?? 'ease');
  const delay = String(parts.delay ?? '0s');
  return (
    <TokenRow
      token={token}
      demo={<Demo duration={duration} timing={timing} delay={delay} />}
      detail={
        <span className="flex flex-col">
          <span>Duration {duration}</span>
          <span>Easing {timing}</span>
          <span>Delay {delay}</span>
        </span>
      }
    />
  );
}

export function MotionPage({ data }: { data: BlazonData }) {
  const tokens = data.tokens.items.filter((t) => MOTION_TYPES.includes(t.type ?? ''));
  return (
    <>
      <PageHeader label="Tokens" title="Motion" intro="Durations, easings and transitions, each shown moving. Click one to copy its CSS variable." />
      <Doc>
        {byParent(tokens).map(([parent, group]) => (
          <Section key={parent} heading={lastSegment(parent)} path={parent}>
            {group.map((token) => (
              <MotionRow key={token.path} token={token} />
            ))}
          </Section>
        ))}
      </Doc>
      <PageFooter title={data.title} trail="Tokens / Motion" />
    </>
  );
}
