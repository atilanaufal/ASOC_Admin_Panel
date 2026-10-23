import './env-loader';
import { betterAuth } from 'better-auth';
import { username } from 'better-auth/plugins';
import { getMysqlPool, verifySuperadminCredentials } from './mysql';
import { getSessionSecret } from './session';

export const authDbPool = getMysqlPool();

export const auth = betterAuth({
  database: authDbPool,
  secret: getSessionSecret(),
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3001',
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
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
