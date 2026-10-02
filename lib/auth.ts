import './env-loader';
import { betterAuth } from 'better-auth';
import { username } from 'better-auth/plugins';
import mysql from 'mysql2/promise';
import { verifySuperadminCredentials } from './mysql';
import { getSessionSecret } from './session';

const MYSQL_HOST = process.env.MYSQL_HOST || '';
const MYSQL_PORT = Number(process.env.MYSQL_PORT) || 3306;
const MYSQL_USER = process.env.MYSQL_USER || '';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || process.env.MYSQL_PASS || '';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || process.env.MYSQL_DB || '';

export const authDbPool = mysql.createPool({
  host: MYSQL_HOST,
  port: MYSQL_PORT,
  user: MYSQL_USER,
  password: MYSQL_PASSWORD,
  database: MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  connectTimeout: 3000,
});

export const auth = betterAuth({
  database: authDbPool,
  secret: process.env.BETTER_AUTH_SECRET || getSessionSecret(),
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3001',
  trustedOrigins: async () => {
    const isProd = process.env.NODE_ENV === 'production';
    const origins: string[] = [];
    if (!isProd) {
      origins.push('http://localhost:3001', 'http://127.0.0.1:3001');
    }
    if (process.env.BETTER_AUTH_URL) origins.push(process.env.BETTER_AUTH_URL);
    if (process.env.NEXT_PUBLIC_APP_URL) origins.push(process.env.NEXT_PUBLIC_APP_URL);
    if (process.env.BETTER_AUTH_TRUSTED_ORIGINS) {
      origins.push(...process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(',').map((s) => s.trim()));
    }
    return Array.from(new Set(origins.filter(Boolean)));
  },
  emailAndPassword: {
    enabled: false, // Disabled: all admin logins must traverse custom hardened login route
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'superadmin',
        input: true,
      },
      tenantId: {
        type: 'number',
        required: false,
        defaultValue: 0,
        input: true,
      },
      tenantCode: {
        type: 'string',
        required: false,
        defaultValue: 'MASTER',
        input: true,
      },
      campusName: {
        type: 'string',
        required: false,
        defaultValue: 'ASOC Central Management',
        input: true,
      },
      databaseName: {
        type: 'string',
        required: false,
        defaultValue: '-',
        input: true,
      },
      redisPrefix: {
        type: 'string',
        required: false,
        defaultValue: 'asoc_master',
        input: true,
      },
    },
  },
  plugins: [
    username(),
  ],
});

/**
 * Ensures superadmin is authenticated against MySQL users table
 * and synchronized with Better Auth user table with role 'superadmin'.
 */
export async function syncSuperadminToBetterAuth(
  usernameOrEmail: string,
  plainPassword: string
): Promise<{ success: boolean; error?: string; user?: any }> {
  try {
    const check = await verifySuperadminCredentials(usernameOrEmail, plainPassword);
    if (!check.success || !check.user) {
      return { success: false, error: check.error || 'Authentication failed.' };
    }

    return { success: true, user: check.user };
  } catch (err: any) {
    console.error('Error in syncSuperadminToBetterAuth:', err);
    return { success: false, error: err.message };
  }
}
