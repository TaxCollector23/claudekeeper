import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

export async function notify(title: string, body: string): Promise<void> {
  if (process.platform !== 'darwin') return;
  const script = `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)}`;
  try {
    await execFile('osascript', ['-e', script]);
  } catch {
    /* notifications are best-effort */
  }
}
