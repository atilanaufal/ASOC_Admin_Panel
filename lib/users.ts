import { getMysqlPool, hashPasswordSHA256 } from './mysql';
import { auth, authDbPool } from './auth';
import crypto from 'crypto';

export interface UserItem {
  id: number | string;
  tenant_id: number;
  username: string;
  email: string | null;
  role: string;
  created_at: string | Date;
  tenant_code?: string;
  campus_name?: string;
  database_name?: string;
  redis_prefix?: string;
  tenant_is_active?: number | boolean;
}

export interface ListUsersParams {
  tenant?: string;
  role?: string;
  search?: string;
}

/**
 * Lists all users with multi-tenant filtering and search capability.
 */
export async function listUsers(params: ListUsersParams = {}): Promise<UserItem[]> {
  const pool = getMysqlPool();
  let query = `
    SELECT 
      u.id,
      u.tenant_id,
      COALESCE(u.name, '') AS username,
      u.email,
      u.role,
      u.created_at,
      t.tenant_code,
      t.campus_name,
      t.database_name,
      t.redis_prefix,
      t.is_active AS tenant_is_active
    FROM users u
    LEFT JOIN tenants t ON u.tenant_id = t.id
    WHERE 1=1
  `;
  const queryParams: any[] = [];

  if (params.tenant && params.tenant !== 'all') {
    query += ` AND (t.tenant_code = ? OR t.database_name = ?)`;
    queryParams.push(params.tenant, params.tenant);
  }

  if (params.role && params.role !== 'all') {
    query += ` AND u.role = ?`;
    queryParams.push(params.role);
  }

  if (params.search && params.search.trim()) {
    const searchTerm = `%${params.search.trim()}%`;
    query += ` AND (u.name LIKE ? OR u.email LIKE ? OR t.campus_name LIKE ? OR t.tenant_code LIKE ?)`;
    queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }

  query += ` ORDER BY u.created_at DESC`;

  try {
    const [rows]: any = await pool.query(query, queryParams);
    return rows || [];
  } catch {
    // Fallback if legacy table with `username` column is used
    const legacyQuery = query.replace('COALESCE(u.name, \'\') AS username,', 'u.username,').replace('u.name LIKE ?', 'u.username LIKE ?');
    const [legacyRows]: any = await pool.query(legacyQuery, queryParams);
    return legacyRows || [];
  }
}

/**
 * Creates a new user in MySQL `users` and synchronizes with Better-Auth.
 */
export async function createUser(data: {
  username: string;
  email?: string;
  password: string;
  role: string;
  tenantId: number;
}): Promise<{ success: boolean; user?: any; error?: string }> {
  const pool = getMysqlPool();

  try {
    const username = data.username.trim();
    const email = data.email?.trim() || `${username}@asoc.internal`;
    const role = data.role || 'tenant';
    const tenantId = Number(data.tenantId) || 1;

    // 1. Check if username or email already exists in `users`
    let existing: any[] = [];
    try {
      const [checkRows]: any = await pool.query(
        'SELECT id, name AS username, email FROM users WHERE name = ? OR email = ? LIMIT 1',
        [username, email]
      );
      existing = checkRows || [];
    } catch {
      const [checkRows]: any = await pool.query(
        'SELECT id, username, email FROM users WHERE username = ? OR email = ? LIMIT 1',
        [username, email]
      );
      existing = checkRows || [];
    }

    if (existing && existing.length > 0) {
      return {
        success: false,
        error: `Pengguna dengan username '${username}' atau email '${email}' sudah terdaftar.`,
      };
    }

    // 2. Fetch tenant info
    let tenantInfo = {
      tenant_code: 'TNT1',
      campus_name: 'tenant1',
      database_name: 'tenant1',
      redis_prefix: 'tenant1:',
    };

    if (tenantId > 0) {
      const [tenants]: any = await pool.query(
        'SELECT tenant_code, campus_name, database_name, redis_prefix FROM tenants WHERE id = ? LIMIT 1',
        [tenantId]
      );
      if (tenants && tenants.length > 0) {
        tenantInfo = tenants[0];
      }
    }

    // 3. Hash password using SHA-256
    const passwordHash = hashPasswordSHA256(data.password);
    const newId = crypto.randomBytes(16).toString('hex');

    // 4. Insert into MySQL `users` (handles both VM schema and legacy schema)
    let insertedId: any = newId;
    try {
      await pool.query(
        'INSERT INTO users (id, tenant_id, name, password, email, role) VALUES (?, ?, ?, ?, ?, ?)',
        [newId, tenantId, username, passwordHash, email, role]
      );
    } catch {
      const [insertResult]: any = await pool.query(
        'INSERT INTO users (tenant_id, username, password_hash, email, role) VALUES (?, ?, ?, ?, ?)',
        [tenantId, username, passwordHash, email, role]
      );
      insertedId = insertResult.insertId;
    }

    // 5. Synchronize with Better-Auth
    try {
      // Check if Better-Auth user exists
      const [baExisting]: any = await authDbPool.query(
        'SELECT id FROM user WHERE username = ? OR email = ? LIMIT 1',
        [username, email]
      );

      if (!baExisting || baExisting.length === 0) {
        await auth.api.signUpEmail({
          body: {
            email,
            password: data.password,
            name: username,
            username,
            role,
            tenantId,
            tenantCode: tenantInfo.tenant_code,
            campusName: tenantInfo.campus_name,
            databaseName: tenantInfo.database_name,
            redisPrefix: tenantInfo.redis_prefix,
          } as any,
        });
      } else {
        await authDbPool.query(
          `UPDATE user SET 
            role = ?, 
            tenantId = ?, 
            tenantCode = ?, 
            campusName = ?, 
            databaseName = ?, 
            redisPrefix = ? 
           WHERE id = ?`,
          [
            role,
            tenantId,
            tenantInfo.tenant_code,
            tenantInfo.campus_name,
            tenantInfo.database_name,
            tenantInfo.redis_prefix,
            baExisting[0].id,
          ]
        );
      }
    } catch (baErr: any) {
      console.warn('[Better-Auth User Sync Warning]:', baErr.message);
    }

    return {
      success: true,
      user: {
        id: insertedId,
        username,
        email,
        role,
        tenantId,
        campusName: tenantInfo.campus_name,
        databaseName: tenantInfo.database_name,
      },
    };
  } catch (err: any) {
    console.error('Error creating user:', err);
    return {
      success: false,
      error: `Gagal membuat user: ${err.message}`,
    };
  }
}

/**
 * Resets user password in MySQL `users` and synchronizes to Better-Auth.
 * Also revokes all active sessions for this user.
 */
export async function resetUserPassword(
  userId: number | string,
  newPassword: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const pool = getMysqlPool();

  try {
    // 1. Fetch existing user
    let users: any[] = [];
    try {
      const [res]: any = await pool.query(
        'SELECT id, COALESCE(name, "") AS username, email FROM users WHERE id = ? LIMIT 1',
        [userId]
      );
      users = res || [];
    } catch {
      const [res]: any = await pool.query(
        'SELECT id, username, email FROM users WHERE id = ? LIMIT 1',
        [userId]
      );
      users = res || [];
    }

    if (!users || users.length === 0) {
      return { success: false, error: 'User tidak ditemukan.' };
    }

    const user = users[0];
    const passwordHash = hashPasswordSHA256(newPassword);

    // 2. Update password hash in MySQL `users`
    try {
      await pool.query('UPDATE users SET password = ? WHERE id = ?', [passwordHash, userId]);
    } catch {
      await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
    }

    // 3. Update Better-Auth user & sessions (optional/non-blocking)
    try {
      const userEmail = user.email || `${user.username}@asoc.internal`;
      const [baUsers]: any = await authDbPool.query(
        'SELECT id FROM user WHERE username = ? OR email = ? LIMIT 1',
        [user.username, userEmail]
      );

      if (baUsers && baUsers.length > 0) {
        const baUserId = baUsers[0].id;
        await authDbPool.query('DELETE FROM session WHERE userId = ?', [baUserId]);
        await authDbPool.query('DELETE FROM account WHERE userId = ? AND providerId = "credential"', [baUserId]);
        await auth.api.signUpEmail({
          body: {
            email: userEmail,
            password: newPassword,
            name: user.username,
            username: user.username,
          } as any,
        });
      }
    } catch {}

    return {
      success: true,
      message: `Password untuk user '${user.username}' berhasil diperbarui. Seluruh sesi aktif telah dicabut.`,
    };
  } catch (err: any) {
    console.error('Error resetting password:', err);
    return { success: false, error: `Gagal mereset password: ${err.message}` };
  }
}

/**
 * Updates user profile (email, role, tenantId).
 */
export async function updateUser(
  userId: number | string,
  data: { email?: string; role?: string; tenantId?: number; username?: string; name?: string }
): Promise<{ success: boolean; message?: string; error?: string }> {
  const pool = getMysqlPool();

  try {
    let users: any[] = [];
    try {
      const [res]: any = await pool.query(
        'SELECT id, COALESCE(name, "") AS username FROM users WHERE id = ? LIMIT 1',
        [userId]
      );
      users = res || [];
    } catch {
      const [res]: any = await pool.query(
        'SELECT id, username FROM users WHERE id = ? LIMIT 1',
        [userId]
      );
      users = res || [];
    }

    if (!users || users.length === 0) {
      return { success: false, error: 'User tidak ditemukan.' };
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (data.email !== undefined) {
      updates.push('email = ?');
      values.push(data.email.trim());
    }
    if (data.role !== undefined) {
      updates.push('role = ?');
      values.push(data.role);
    }
    if (data.tenantId !== undefined) {
      updates.push('tenant_id = ?');
      values.push(data.tenantId);
    }
    if (data.username !== undefined || data.name !== undefined) {
      const newName = (data.username || data.name || '').trim();
      try {
        updates.push('name = ?');
        values.push(newName);
      } catch {
        updates.push('username = ?');
        values.push(newName);
      }
    }

    if (updates.length > 0) {
      values.push(userId);
      await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    // Optional Sync to Better-Auth user table
    try {
      const username = users[0].username;
      if (data.tenantId) {
        const [tenants]: any = await pool.query(
          'SELECT tenant_code, campus_name, database_name, redis_prefix FROM tenants WHERE id = ? LIMIT 1',
          [data.tenantId]
        );
        if (tenants && tenants.length > 0) {
          const t = tenants[0];
          await authDbPool.query(
            `UPDATE user SET 
              role = COALESCE(?, role), 
              email = COALESCE(?, email),
              tenantId = ?, 
              tenantCode = ?, 
              campusName = ?, 
              databaseName = ?, 
              redisPrefix = ? 
             WHERE username = ?`,
            [data.role, data.email, data.tenantId, t.tenant_code, t.campus_name, t.database_name, t.redis_prefix, username]
          );
        }
      } else {
        await authDbPool.query(
          `UPDATE user SET 
            role = COALESCE(?, role), 
            email = COALESCE(?, email) 
           WHERE username = ?`,
          [data.role, data.email, username]
        );
      }
    } catch {}

    const username = users[0].username;
    return { success: true, message: `Profil user '${username}' berhasil diperbarui.` };
  } catch (err: any) {
    console.error('Error updating user:', err);
    return { success: false, error: `Gagal memperbarui user: ${err.message}` };
  }
}

/**
 * Deletes user from MySQL `users`, Better-Auth `user`, `account`, and revokes sessions.
 */
export async function deleteUser(
  userId: number | string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const pool = getMysqlPool();

  try {
    let users: any[] = [];
    try {
      const [res]: any = await pool.query(
        'SELECT id, COALESCE(name, "") AS username, email, role FROM users WHERE id = ? LIMIT 1',
        [userId]
      );
      users = res || [];
    } catch {
      const [res]: any = await pool.query(
        'SELECT id, username, email, role FROM users WHERE id = ? LIMIT 1',
        [userId]
      );
      users = res || [];
    }

    if (!users || users.length === 0) {
      return { success: false, error: 'User tidak ditemukan.' };
    }

    const user = users[0];

    // Prevent deleting the primary superadmin
    if (user.username === 'superadmin' || user.username === 'admin') {
      return { success: false, error: 'Akun superadmin utama tidak dapat dihapus.' };
    }

    // 1. Delete from MySQL `users`
    await pool.query('DELETE FROM users WHERE id = ?', [userId]);

    // 2. Delete from Better-Auth (optional)
    try {
      const userEmail = user.email || `${user.username}@asoc.internal`;
      const [baUsers]: any = await authDbPool.query(
        'SELECT id FROM user WHERE username = ? OR email = ? LIMIT 1',
        [user.username, userEmail]
      );

      if (baUsers && baUsers.length > 0) {
        const baUserId = baUsers[0].id;
        await authDbPool.query('DELETE FROM session WHERE userId = ?', [baUserId]);
        await authDbPool.query('DELETE FROM account WHERE userId = ?', [baUserId]);
        await authDbPool.query('DELETE FROM user WHERE id = ?', [baUserId]);
      }
    } catch {}

    return {
      success: true,
      message: `User '${user.username}' berhasil dihapus beserta seluruh sesi aktifnya.`,
    };
  } catch (err: any) {
    console.error('Error deleting user:', err);
    return { success: false, error: `Gagal menghapus user: ${err.message}` };
  }
}
