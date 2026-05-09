import React from 'react';
import type { RalphIterationPhase } from '../../../ui/uiTypes';

const PHASES: RalphIterationPhase[] = ['inspect','select','prompt','execute','verify','classify','persist'];

interface PhaseTrackerProps {
  phase: RalphIterationPhase | null;
  compact?: boolean;
}

export function PhaseTracker({ phase, compact }: PhaseTrackerProps) {
  if (phase === null) return null;
  const activeIdx = PHASES.indexOf(phase);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 4 : 6, flexWrap: 'wrap' }}>
      {PHASES.map((p, i) => {
        const done = i < activeIdx;
        const now  = i === activeIdx;
        return (
          <React.Fragment key={p}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: compact ? '3px 7px' : '4px 9px',
              borderRadius: 5,
              fontSize: compact ? 10 : 11,
              background: now ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : done ? 'var(--surface-2)' : 'transparent',
              color: now ? 'var(--accent)' : done ? 'var(--fg)' : 'var(--dim)',
              border: `1px solid ${now ? 'color-mix(in srgb, var(--accent) 50%, transparent)' : done ? 'var(--border)' : 'transparent'}`,
              fontWeight: now ? 600 : 400,
              letterSpacing: 0.2,
            }}>
              {done && <span style={{ opacity: 0.7 }}>✓</span>}
              {now && (
                <span style={{
                  display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                  background: 'var(--accent)',
                  animation: 'rdx-blink 1.1s ease-in-out infinite',
                }} />
              )}
              {p}
            </div>
            {i < PHASES.length - 1 && (
              <span style={{ color: 'var(--border)', fontSize: 9 }}>─</span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
