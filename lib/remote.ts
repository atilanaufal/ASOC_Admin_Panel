import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Centralized remote VM host configuration for SSH execution and connectivity.
 * Reads dynamically from environment variables:
 * - VM_HOST (fallback: MYSQL_HOST, REDIS_HOST, or '10.20.100.86')
 * - VM_SSH_USER (fallback: 'ubuntu')
 */
export function getRemoteVmConfig() {
  const host = process.env.VM_HOST || process.env.MYSQL_HOST || process.env.REDIS_HOST || '10.20.100.86';
  const user = process.env.VM_SSH_USER || 'ubuntu';
  return { host, user };
}

/**
 * Executes a bash command on the remote VM via SSH.
 */
export async function runRemoteScript(
  commandStr: string,
  timeoutMs: number = 60000
): Promise<{ stdout: string; stderr: string; success: boolean }> {
  try {
    const { host: vmHost, user: vmUser } = getRemoteVmConfig();
    const remoteCmd = `ssh -o BatchMode=yes -o ConnectTimeout=8 ${vmUser}@${vmHost} "${commandStr.replace(/"/g, '\\"')}"`;
    const { stdout, stderr } = await execAsync(remoteCmd, { timeout: timeoutMs });
    return { stdout: stdout.trim(), stderr: stderr.trim(), success: true };
  } catch (err: any) {
    return {
      stdout: (err.stdout || '').trim(),
      stderr: (err.stderr || err.message || '').trim(),
      success: false,
    };
  }
}

