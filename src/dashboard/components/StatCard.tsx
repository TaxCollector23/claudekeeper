import React from 'react';

export function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'ok' | 'warn' | 'err' | 'dim';
}) {
  return (
    <div className={`card${tone ? ` tone-${tone}` : ''}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
