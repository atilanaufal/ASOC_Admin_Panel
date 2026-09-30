import fs from 'fs';
import path from 'path';

export function loadMultiTenantEnv() {
  const envFiles = [
    path.resolve(process.cwd(), '.env.production'),
    path.resolve(process.cwd(), '.env'),
    '/opt/asoc_admin_panel/.env.production',
    '/opt/multi-tenant/.env',
    '/opt/multi-tenant/scripts2/.env.wazuh2'
  ];

  for (const envPath of envFiles) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf-8');
        const lines = content.split('\n');
        for (const rawLine of lines) {
          const trimmed = rawLine.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
            if (!process.env[key] && val) {
              process.env[key] = val;
            }
            if (key === 'MYSQL_PASS' && !process.env.MYSQL_PASSWORD) process.env.MYSQL_PASSWORD = val;
            if (key === 'MYSQL_DB' && !process.env.MYSQL_DATABASE) process.env.MYSQL_DATABASE = val;
            if (key === 'MONGO_URI' && !process.env.MONGODB_URI) process.env.MONGODB_URI = val;
            if (key === 'WAZUH_API_PASS' && !process.env.WAZUH_API_PASSWORD) process.env.WAZUH_API_PASSWORD = val;
            if (key === 'IRIS_BASE_URL' && !process.env.IRIS_API_URL) process.env.IRIS_API_URL = val;
            if (key === 'INDEXER_HOST' && !process.env.OPENSEARCH_URL) process.env.OPENSEARCH_URL = val;
          }
        }
      } catch (e) {
        console.warn(`Could not read ${envPath}:`, e);
      }
    }
  }
}

loadMultiTenantEnv();
