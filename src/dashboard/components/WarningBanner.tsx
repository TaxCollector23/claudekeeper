import React from 'react';
import type { Session, SystemStatus } from '../api';
import { isActive } from '../util';

// Priority order (only one shows):
//   1. battery + no AC + active session
//   2. lid closed
//   3. Claude Code not installed
//   4. daemon unreachable
export function WarningBanner({
  status,
  sessions,
  connected,
}: {
  status: SystemStatus | null;
  sessions: Session[];
  connected: boolean;
}) {
  const hasActive = sessions.some(isActive);

  if (status && status.power.source === 'battery' && hasActive) {
    const pct = status.power.batteryPercent;
    return (
      <div className="warning-banner warn">
        Claude is running on battery{pct != null ? ` (${pct}%)` : ''}. Long-running tasks may drain your battery.
      </div>
    );
  }
  if (status && status.lid === 'closed') {
    return (
      <div className="warning-banner warn">
        Lid is closed. macOS may suspend the process on unsupported hardware.
      </div>
    );
  }
  if (status && !status.claudeInstalled) {
    return (
      <div className="warning-banner err">
        Claude Code not detected. Install it or set its path.
      </div>
    );
  }
  if (!connected) {
    return (
      <div className="warning-banner err">
        Cannot reach ClaudeKeeper daemon at http://127.0.0.1:7642.
      </div>
    );
  }
  return null;
}
