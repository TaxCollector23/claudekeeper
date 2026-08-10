import React, { useEffect, useRef, useState } from 'react';
import type { LogLine } from '../api';
import { stripAnsi } from '../util';

export function LogViewer({
  logs,
  onClear,
}: {
  logs: LogLine[];
  onClear: () => void;
}) {
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoScroll) return;
    const el = elRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length, autoScroll]);

  const copy = async () => {
    const text = logs.map((l) => stripAnsi(l.content)).join('');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="logviewer">
      <div className="logbar">
        <button className={`btn${autoScroll ? ' active' : ''}`} onClick={() => setAutoScroll((v) => !v)}>
          {autoScroll ? 'Pause scroll' : 'Resume scroll'}
        </button>
        <button className="btn" onClick={onClear}>Clear</button>
        <button className="btn" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        <span className="log-count">Showing last {logs.length} lines</span>
      </div>
      <div className="logs mono" ref={elRef}>
        {logs.length === 0 ? <span className="dim">(no output yet)</span> : logs.map((l) =>
          <span key={l.id} className={l.stream === 'stderr' ? 'stderr' : undefined}>{stripAnsi(l.content)}</span>
        )}
      </div>
    </div>
  );
}
