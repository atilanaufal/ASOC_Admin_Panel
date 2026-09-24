import './env-loader';
import mysql from 'mysql2/promise';
import crypto from 'crypto';

function getMysqlHost() {
  return process.env.MYSQL_HOST || '127.0.0.1';
}

const MYSQL_PORT = Number(process.env.MYSQL_PORT) || 3306;
const MYSQL_USER = process.env.MYSQL_USER || '';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || process.env.MYSQL_PASS || '';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || process.env.MYSQL_DB || '';
const MYSQL_SALT = process.env.MYSQL_SALT || 'sec_auth_salt_2026';

let activePool: mysql.Pool | null = null;

export function getMysqlPool(): mysql.Pool {
  if (!activePool) {
    activePool = mysql.createPool({
      host: getMysqlHost(),
      port: MYSQL_PORT,
      user: MYSQL_USER,
      password: MYSQL_PASSWORD,
      database: MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      connectTimeout: 3000,
    });
  }
  return activePool;
}

export function hashPasswordSHA256(password: string): string {
  return crypto.createHash('sha256').update(password, 'utf-8').digest('hex');
}

export function hashPasswordSHA256Salted(password: string, salt: string = MYSQL_SALT): string {
  return crypto.createHash('sha256').update(password + salt, 'utf-8').digest('hex');
}

export function hashPasswordSHA512(password: string, salt: string = MYSQL_SALT): string {
  const salted = password + salt;
  return crypto.createHash('sha512').update(salted, 'utf-8').digest('hex');
}

export function hashPasswordSHA512Raw(password: string): string {
  return crypto.createHash('sha512').update(password, 'utf-8').digest('hex');
}

export async function getMysqlConnection(): Promise<mysql.PoolConnection> {
  const pool = getMysqlPool();
  return await pool.getConnection();
}

export async function pingMysql(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  let conn: mysql.PoolConnection | null = null;
  try {
    conn = await getMysqlConnection();
    await conn.query('SELECT 1');
    const latencyMs = Date.now() - start;
    return { ok: true, latencyMs };
  } catch (err: any) {
    return { ok: false, latencyMs: Date.now() - start, error: err.message };
  } finally {
    if (conn) {
      try { conn.release(); } catch {}
    }
  }
}

export interface UserRecord {
  id: number | string;
  tenant_id: number;
  username: string;
  email: string | null;
  role: 'superadmin' | 'tenant' | string;
  tenant_code?: string;
  campus_name?: string;
  database_name?: string;
  redis_prefix?: string;
}

export async function verifySuperadminCredentials(
  usernameOrEmailInput: string,
  passwordInput: string
): Promise<{ success: boolean; user?: UserRecord; error?: string }> {
  let conn: mysql.PoolConnection | null = null;
  try {
    conn = await getMysqlConnection();
    let user: any = null;

    // 1. Check `admin_users` table first (VM 192.168.30.184 specific)
    try {
      const [adminRows]: any = await conn.execute(
        `SELECT id, username, name, email, password AS password_hash, role
         FROM admin_users
         WHERE username = ? OR email = ?
         LIMIT 1`,
        [usernameOrEmailInput, usernameOrEmailInput]
      );
      if (Array.isArray(adminRows) && adminRows.length > 0) {
        user = {
          ...adminRows[0],
          tenant_id: 0,
          tenant_code: 'MASTER',
          campus_name: 'ASOC Central Management',
          database_name: '-',
          redis_prefix: 'asoc_master',
        };
      }
    } catch {
      // admin_users table might not exist on old schema
    }

    // 2. Fallback to `users` table (checks both `name` and `username` column variations)
    if (!user) {
      try {
        const [userRows]: any = await conn.execute(
          `SELECT 
            u.id, 
            u.tenant_id, 
            COALESCE(u.name, '') AS username, 
            u.password AS password_hash, 
            u.email,
            u.role,
            t.tenant_code, 
            t.campus_name, 
            t.database_name, 
            t.redis_prefix
           FROM users u
           LEFT JOIN tenants t ON u.tenant_id = t.id
           WHERE u.name = ? OR u.email = ?
           LIMIT 1`,
          [usernameOrEmailInput, usernameOrEmailInput]
        );
        if (Array.isArray(userRows) && userRows.length > 0) {
          user = userRows[0];
        }
      } catch {
        // Fallback for legacy schema where column was `username` and `password_hash`
        try {
          const [legacyRows]: any = await conn.execute(
            `SELECT 
              u.id, 
              u.tenant_id, 
              u.username, 
              COALESCE(u.password_hash, u.password) AS password_hash, 
              u.email,
              u.role,
              t.tenant_code, 
              t.campus_name, 
              t.database_name, 
              t.redis_prefix
             FROM users u
             LEFT JOIN tenants t ON u.tenant_id = t.id
             WHERE u.username = ? OR u.email = ?
             LIMIT 1`,
            [usernameOrEmailInput, usernameOrEmailInput]
          );
          if (Array.isArray(legacyRows) && legacyRows.length > 0) {
            user = legacyRows[0];
          }
        } catch {}
      }
    }

    if (!user) {
      return { success: false, error: 'Username atau email tidak ditemukan di sistem ASOC.' };
    }

    const storedHash = user.password_hash;
    const computedSha256 = hashPasswordSHA256(passwordInput);
    const computedSha256SaltPrimary = hashPasswordSHA256Salted(passwordInput, MYSQL_SALT);
    const computedSha256SaltDoc = hashPasswordSHA256Salted(passwordInput, 'tguard_secure_salt_2026');
    const computedSha512Primary = hashPasswordSHA512(passwordInput, MYSQL_SALT);
    const computedSha512Doc = hashPasswordSHA512(passwordInput, 'tguard_secure_salt_2026');
    const computedSha512Raw = hashPasswordSHA512Raw(passwordInput);

    const isMatch = (
      storedHash === computedSha256 ||
      storedHash === computedSha256SaltPrimary ||
      storedHash === computedSha256SaltDoc ||
      storedHash === computedSha512Primary ||
      storedHash === computedSha512Doc ||
      storedHash === computedSha512Raw ||
      storedHash === passwordInput
    );

    if (!isMatch) {
      return { success: false, error: 'Password yang Anda masukkan salah.' };
    }

    const userRole = (user.role || (user.username === 'superadmin' ? 'superadmin' : user.username === 'admin' ? 'admin' : 'tenant')).toLowerCase();

    if (userRole !== 'superadmin' && userRole !== 'admin') {
      return {
        success: false,
        error: 'Akses Ditolak. Halaman ini khusus untuk Administrator. Akun Anda terdaftar sebagai user tenant.',
      };
    }

    return {
      success: true,
      user: {
        id: user.id,
        tenant_id: user.tenant_id || 0,
        username: user.username,
        email: user.email,
        role: userRole === 'superadmin' ? 'superadmin' : 'admin',
        tenant_code: user.tenant_code || 'MASTER',
        campus_name: user.campus_name || 'ASOC Central Management',
        database_name: user.database_name || '-',
        redis_prefix: user.redis_prefix || 'asoc_master',
      },
    };
  } catch (err: any) {
    console.error('MySQL Database Connection Error:', err.message);
    return {
      success: false,
      error: `Gagal terhubung ke Database MySQL (${getMysqlHost()}:${MYSQL_PORT}): ${err.message}`,
    };
  } finally {
    if (conn) {
      try { conn.release(); } catch {}
    }
  }
}
