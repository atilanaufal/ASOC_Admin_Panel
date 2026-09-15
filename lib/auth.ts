import { betterAuth } from 'better-auth';
import { username } from 'better-auth/plugins';
import mysql from 'mysql2/promise';
import { verifySuperadminCredentials } from './mysql';

const MYSQL_HOST = process.env.MYSQL_HOST || '';
const MYSQL_PORT = Number(process.env.MYSQL_PORT) || 3306;
const MYSQL_USER = process.env.MYSQL_USER || '';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || '';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || '';

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
  secret: process.env.BETTER_AUTH_SECRET || 'a8f9c42b10d7e6f3a1b5c9d2e4f7a8b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6',
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
        defaultValue: 'platform_master',
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
    // 1. Verify against master users table with Superadmin role verification
    const check = await verifySuperadminCredentials(usernameOrEmail, plainPassword);
    if (!check.success || !check.user) {
      return { success: false, error: check.error || 'Autentikasi gagal.' };
    }

    const masterUser = check.user;
    const userEmail = masterUser.email || `${masterUser.username}@asoc.internal`;

    // 2. Optionally synchronize with Better Auth if tables exist
    try {
      const [existingRows]: any = await authDbPool.query(
        'SELECT id, email, username, role FROM user WHERE username = ? OR email = ? LIMIT 1',
        [masterUser.username, userEmail]
      );

      if (existingRows && existingRows.length > 0) {
        const baUser = existingRows[0];
        await authDbPool.query(
          `UPDATE user SET 
            role = 'superadmin', 
            tenantId = ?, 
            tenantCode = ?, 
            campusName = ?, 
            databaseName = ?, 
            redisPrefix = ?
           WHERE id = ?`,
          [
            masterUser.tenant_id,
            masterUser.tenant_code || 'MASTER',
            masterUser.campus_name || 'ASOC Central Management',
            masterUser.database_name || 'platform_master',
            masterUser.redis_prefix || 'asoc_master',
            baUser.id,
          ]
        );
      } else {
        await auth.api.signUpEmail({
          body: {
            email: userEmail,
            password: plainPassword,
            name: 'ASOC Superadmin',
            username: masterUser.username,
            role: 'superadmin',
            tenantId: masterUser.tenant_id,
            tenantCode: masterUser.tenant_code || 'MASTER',
            campusName: masterUser.campus_name || 'ASOC Central Management',
            databaseName: masterUser.database_name || 'platform_master',
            redisPrefix: masterUser.redis_prefix || 'asoc_master',
          } as any,
        });
      }
    } catch (baErr: any) {
      // Non-blocking: native admin_users / users authentication is the SSOT
      console.warn('Better Auth sync skipped or table absent:', baErr.message);
    }

    return { success: true, user: { ...masterUser, role: 'superadmin' } };
  } catch (err: any) {
    console.error('Error in syncSuperadminToBetterAuth:', err);
    return { success: false, error: err.message };
  }
}
