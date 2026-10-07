/**
 * ASOC Cron Manager Client
 * Connects Next.js to Host Cron Manager Daemon (via HTTP REST API)
 * Enables Dockerized Next.js to manage host crontab securely without SSH/sudo shell access.
 */

const getCronManagerConfig = () => {
  const url = process.env.CRON_MANAGER_URL || "http://127.0.0.1:8765";
  const secret = process.env.CRON_MANAGER_SECRET || "asoc-cron-secret-key-2026";
  return { url, secret };
};

export interface HostCronStatus {
  success: boolean;
  schedule: string;
  enabled: boolean;
  active: boolean;
  raw_entry?: string;
  lastRun?: string;
  error?: string;
}

export async function getHostCronStatus(): Promise<HostCronStatus> {
  const { url, secret } = getCronManagerConfig();
  try {
    const res = await fetch(`${url}/cron`, {
      method: "GET",
      headers: {
        "X-ASOC-Secret": secret,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, schedule: "0 * * * *", enabled: false, active: false, error: errText };
    }

    const data = await res.json();
    return {
      success: true,
      schedule: data.schedule || "0 * * * *",
      enabled: Boolean(data.enabled),
      active: Boolean(data.active),
      raw_entry: data.raw_entry,
      lastRun: data.last_run || undefined,
    };
  } catch (err: any) {
    return { success: false, schedule: "0 * * * *", enabled: false, active: false, error: err.message };
  }
}

export async function updateHostCron(
  schedule: string,
  enabled: boolean
): Promise<{ success: boolean; message?: string; error?: string }> {
  const { url, secret } = getCronManagerConfig();
  try {
    const res = await fetch(`${url}/cron`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ASOC-Secret": secret,
      },
      body: JSON.stringify({ schedule, enabled }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.detail || "Failed to update cron via Host Cron Manager" };
    }

    return { success: true, message: data.message };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getHostCronLogs(lines: number = 60): Promise<string> {
  const { url, secret } = getCronManagerConfig();
  try {
    const res = await fetch(`${url}/logs?lines=${lines}`, {
      method: "GET",
      headers: {
        "X-ASOC-Secret": secret,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return "Failed to fetch logs from Host Cron Manager";
    }

    const data = await res.json();
    return data.logs || "";
  } catch (err: any) {
    return `Error fetching logs: ${err.message}`;
  }
}
