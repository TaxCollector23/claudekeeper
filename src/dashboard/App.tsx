import React, { useEffect, useState } from 'react';
import { api, subscribeEvents, type SystemStatus } from './api';
import { humanUptime, useTicker } from './util';
import logoUrl from './logo.png';

type Load =
  | { state: 'loading' }
  | { state: 'ok'; status: SystemStatus }
  | { state: 'down' };

export function App() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const status = await api.status();
        if (!cancelled) setLoad({ state: 'ok', status });
      } catch {
        if (!cancelled) setLoad({ state: 'down' });
      }
    };
    refresh();
    const unsub = subscribeEvents({
      onEvent: refresh,
      onOpen: refresh,
      onError: () => { if (!cancelled) setLoad({ state: 'down' }); },
    });
    const t = setInterval(refresh, 4000);
    return () => { cancelled = true; unsub(); clearInterval(t); };
  }, []);

  const running = load.state === 'ok';

  return (
    <div className="page">
      <header className="top">
        <div className="brand">
          <img className="mk" src={logoUrl} alt="" width={40} height={40} />
          <span className="name">ClaudeKeeper</span>
        </div>
        <StatusPill state={load.state} />
      </header>

      <main className="content">
        {load.state === 'loading' && <Loading />}
        {load.state === 'down' && <Down />}
        {running && <Status status={load.status} />}
      </main>
    </div>
  );
}

function StatusPill({ state }: { state: Load['state'] }) {
  if (state === 'ok') {
    return (
      <span className="pill" role="status" aria-label="Daemon running">
        <span className="dot on" aria-hidden="true" />Running
      </span>
    );
  }
  if (state === 'down') {
    return (
      <span className="pill" role="status" aria-label="Daemon not running">
        <span className="dot off" aria-hidden="true" />Not running
      </span>
    );
  }
  return (
    <span className="pill" role="status" aria-label="Checking daemon">
      <span className="dot idle" aria-hidden="true" />Checking…
    </span>
  );
}

function Loading() {
  return <p className="lede muted">Checking on the keeper…</p>;
}

function Down() {
  return (
    <section className="hero">
      <h1 className="headline">The keeper isn’t running.</h1>
      <p className="lede muted">
        Nothing is holding your Mac awake right now. Start it from a terminal and this
        page will pick it up.
      </p>
      <div className="cmd">
        <span className="dollar" aria-hidden="true">$</span>
        <code>claudekeeper daemon start</code>
      </div>
    </section>
  );
}

function Status({ status }: { status: SystemStatus }) {
  const now = useTicker(true, 1000);
  const { daemon, sleepAssertionActive, power, lid, claudeInstalled } = status;
  const address = `http://localhost:${daemon.port}`;
  const uptime = humanUptime(daemon.startedAt, now);
  const awake = sleepAssertionActive;

  return (
    <>
      <section className="hero">
        <h1 className="headline">
          {awake ? 'Your Mac is being kept awake.' : 'The keeper is running, but sleep isn’t held.'}
        </h1>
        <p className="lede muted">
          {awake
            ? 'Step away and it won’t sleep — Claude Code keeps running while you’re gone.'
            : 'The daemon is up but nothing is preventing sleep at the moment.'}
        </p>
        <div className="cmd">
          <span className="dollar" aria-hidden="true">›</span>
          <a className="addr" href={address}>{address}</a>
        </div>
      </section>

      <dl className="facts">
        <Fact label="Status" value="Running" accent />
        <Fact label="Address" value={address} mono />
        <Fact label="Uptime" value={uptime} mono />
        <Fact label="Keeping awake" value={awake ? 'Yes' : 'No'} accent={awake} />
        <Fact label="Power" value={powerLabel(power)} />
        <Fact label="Lid" value={lidLabel(lid)} />
        <Fact label="Claude Code" value={claudeInstalled ? 'Detected' : 'Not found'} />
      </dl>
    </>
  );
}

function Fact({ label, value, mono, accent }: {
  label: string; value: string; mono?: boolean; accent?: boolean;
}) {
  const cls = ['fv', mono ? 'mono' : '', accent ? 'accent' : ''].filter(Boolean).join(' ');
  return (
    <div className="fact">
      <dt className="fl">{label}</dt>
      <dd className={cls}>{value}</dd>
    </div>
  );
}

function powerLabel(power: SystemStatus['power']): string {
  if (power.source === 'ac') return power.charging ? 'AC power (charging)' : 'AC power';
  if (power.source === 'battery') {
    return power.batteryPercent != null ? `Battery ${power.batteryPercent}%` : 'Battery';
  }
  return 'Unknown';
}

function lidLabel(lid: SystemStatus['lid']): string {
  if (lid === 'open') return 'Open';
  if (lid === 'closed') return 'Closed';
  return 'Unknown';
}
