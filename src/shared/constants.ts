import os from 'node:os';
import path from 'node:path';

export const DEFAULT_PORT = 7642;
export const DEFAULT_HOST = '127.0.0.1';

export const CONFIG_DIR = path.join(os.homedir(), '.config', 'claudekeeper');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
export const DATA_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'ClaudeKeeper');
export const LOG_DIR = path.join(os.homedir(), 'Library', 'Logs', 'ClaudeKeeper');
export const SESSIONS_LOG_DIR = path.join(LOG_DIR, 'sessions');
export const DB_FILE = path.join(DATA_DIR, 'claudekeeper.db');
export const PID_FILE = path.join(DATA_DIR, 'daemon.pid');
export const LAUNCHD_LABEL = 'com.claudekeeper.daemon';
