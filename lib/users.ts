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
  password?: string;
}

export interface ListUsersParams {
  tenant?: string;
  role?: string;
  search?: string;
}

/**
 * Lists all users with multi-tenant filtering and search capability.
 * Admin users are platform-level and not tied to any tenant.
 */
export async function listUsers(params: ListUsersParams = {}): Promise<UserItem[]> {
  const pool = getMysqlPool();
  const allUsers: UserItem[] = [];

  // 1. Fetch Platform Admins from `admin_users` (unless filtered by a specific tenant)
  const shouldIncludeAdmins = (!params.tenant || params.tenant === 'all') && (!params.role || params.role === 'all' || params.role === 'admin' || params.role === 'superadmin');

  if (shouldIncludeAdmins) {
    try {
      let adminQuery = `
        SELECT 
          id,
          0 AS tenant_id,
          COALESCE(username, name, '') AS username,
          email,
          COALESCE(role, 'admin') AS role,
          created_at,
          '-' AS tenant_code,
          '-' AS campus_name,
          '-' AS database_name,
          '-' AS redis_prefix,
          1 AS tenant_is_active,
          COALESCE(password, '') AS password
        FROM admin_users
        WHERE 1=1
      `;
      const adminParams: any[] = [];
      if (params.search && params.search.trim()) {
        const s = `%${params.search.trim()}%`;
        adminQuery += ` AND (username LIKE ? OR email LIKE ? OR name LIKE ?)`;
        adminParams.push(s, s, s);
      }
      adminQuery += ` ORDER BY created_at DESC`;
      const [adminRows]: any = await pool.query(adminQuery, adminParams);
      if (Array.isArray(adminRows)) {
        allUsers.push(...adminRows);
      }
    } catch {}
  }

  // 2. Fetch Tenant Users from `users`
  const shouldIncludeTenantUsers = !params.role || params.role === 'all' || params.role === 'tenant';

  if (shouldIncludeTenantUsers) {
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
        t.is_active AS tenant_is_active,
        COALESCE(u.password, '') AS password
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
      const dbRole = params.role === 'admin' ? 'admin' : 'tenant';
      query += ` AND u.role = ?`;
      queryParams.push(dbRole);
    }

    if (params.search && params.search.trim()) {
      const searchTerm = `%${params.search.trim()}%`;
      query += ` AND (u.name LIKE ? OR u.email LIKE ? OR t.campus_name LIKE ? OR t.tenant_code LIKE ?)`;
      queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    query += ` ORDER BY u.created_at DESC`;

    try {
      const [rows]: any = await pool.query(query, queryParams);
      if (Array.isArray(rows)) {
        allUsers.push(...rows);
      }
    } catch {
      const legacyQuery = query.replace('COALESCE(u.name, \'\') AS username,', 'u.username,').replace('u.name LIKE ?', 'u.username LIKE ?');
      const [legacyRows]: any = await pool.query(legacyQuery, queryParams);
      if (Array.isArray(legacyRows)) {
        allUsers.push(...legacyRows);
      }
    }
  }

  return allUsers;
}

/**
 * Creates a new user.
 * Role 'admin' -> Inserts into `admin_users` without tenant binding.
 * Role 'tenant' -> Inserts into `users` tied to tenant_id.
 */
export async function createUser(data: {
  username: string;
  email?: string;
  password: string;
  role: string;
  tenantId?: number | null;
}): Promise<{ success: boolean; user?: any; error?: string }> {
  const pool = getMysqlPool();

  try {
    const username = data.username.trim();
    const email = data.email?.trim() || `${username}@asoc.internal`;
    const role = data.role === 'admin' ? 'admin' : 'tenant';
    const passwordHash = hashPasswordSHA256(data.password);
    const newId = crypto.randomBytes(16).toString('hex');

    // 1. Check existing in admin_users or users
    const [adminCheck]: any = await pool.query(
      'SELECT id FROM admin_users WHERE username = ? OR email = ? LIMIT 1',
      [username, email]
    );
    if (adminCheck && adminCheck.length > 0) {
      return { success: false, error: `Pengguna dengan username '${username}' atau email '${email}' sudah terdaftar sebagai Admin.` };
    }

    const [userCheck]: any = await pool.query(
      'SELECT id FROM users WHERE name = ? OR email = ? LIMIT 1',
      [username, email]
    ).catch(async () => {
      return await pool.query('SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1', [username, email]);
    });

    if (userCheck && userCheck[0] && userCheck[0].length > 0) {
      return { success: false, error: `Pengguna dengan username '${username}' atau email '${email}' sudah terdaftar.` };
    }

    // 2. Branch by Role
    if (role === 'admin') {
      // Platform Admin: stored in `admin_users`, NO tenant binding
      await pool.query(
        'INSERT INTO admin_users (id, username, name, email, password, role) VALUES (?, ?, ?, ?, ?, "admin")',
        [newId, username, username, email, passwordHash]
      );

      // Sync with Better-Auth
      try {
        await auth.api.signUpEmail({
          body: {
            email,
            password: data.password,
            name: username,
            username,
            role: 'admin',
            tenantId: 0,
            tenantCode: 'MASTER',
            campusName: 'ASOC Central Management',
            databaseName: '-',
            redisPrefix: 'asoc_master',
          } as any,
        }).catch(() => {});
      } catch {}

      return {
        success: true,
        user: {
          id: newId,
          username,
          email,
          role: 'admin',
          tenantId: null,
          campusName: '-',
          databaseName: '-',
        },
      };
    }

    // Tenant Analyst: requires tenant
    const tenantId = Number(data.tenantId) || 1;
    let tenantInfo = {
      tenant_code: 'TNT1',
      campus_name: 'tenant1',
      database_name: 'tenant1',
      redis_prefix: 'tenant1:',
    };

    const [tenants]: any = await pool.query(
      'SELECT tenant_code, campus_name, database_name, redis_prefix FROM tenants WHERE id = ? LIMIT 1',
      [tenantId]
    );
    if (tenants && tenants.length > 0) {
      tenantInfo = tenants[0];
    }

    let insertedId: any = newId;
    try {
      await pool.query(
        'INSERT INTO users (id, tenant_id, name, password, email, role) VALUES (?, ?, ?, ?, ?, ?)',
        [newId, tenantId, username, passwordHash, email, 'tenant']
      );
    } catch {
      const [insertResult]: any = await pool.query(
        'INSERT INTO users (tenant_id, username, password_hash, email, role) VALUES (?, ?, ?, ?, ?)',
        [tenantId, username, passwordHash, email, 'tenant']
      );
      insertedId = insertResult.insertId;
    }

    // Sync with Better-Auth
    try {
      await auth.api.signUpEmail({
        body: {
          email,
          password: data.password,
          name: username,
          username,
          role: 'tenant',
          tenantId,
          tenantCode: tenantInfo.tenant_code,
          campusName: tenantInfo.campus_name,
          databaseName: tenantInfo.database_name,
          redisPrefix: tenantInfo.redis_prefix,
        } as any,
      }).catch(() => {});
    } catch {}

    return {
      success: true,
      user: {
        id: insertedId,
        username,
        email,
        role: 'tenant',
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
 * Resets user password in MySQL `admin_users` or `users` and synchronizes to Better-Auth.
 */
export async function resetUserPassword(
  userId: number | string,
  newPassword: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const pool = getMysqlPool();

  try {
    const passwordHash = hashPasswordSHA256(newPassword);

    // 1. Check in `admin_users`
    const [adminRows]: any = await pool.query(
      'SELECT id, username, email FROM admin_users WHERE id = ? OR username = ? LIMIT 1',
      [userId, userId]
    );

    if (adminRows && adminRows.length > 0) {
      const admin = adminRows[0];
      await pool.query('UPDATE admin_users SET password = ? WHERE id = ?', [passwordHash, admin.id]);
      return {
        success: true,
        message: `Password untuk Admin '${admin.username}' berhasil diperbarui.`,
      };
    }

    // 2. Check in `users`
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
    try {
      await pool.query('UPDATE users SET password = ? WHERE id = ?', [passwordHash, user.id]);
    } catch {
      await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, user.id]);
    }

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
    // 1. Check if admin
    const [adminRows]: any = await pool.query(
      'SELECT id, username, email FROM admin_users WHERE id = ? OR username = ? LIMIT 1',
      [userId, userId]
    );

    if (adminRows && adminRows.length > 0) {
      const admin = adminRows[0];
      const updates: string[] = [];
      const vals: any[] = [];
      if (data.email) {
        updates.push('email = ?');
        vals.push(data.email.trim());
      }
      if (data.name || data.username) {
        updates.push('name = ?');
        vals.push((data.name || data.username || '').trim());
      }
      if (updates.length > 0) {
        vals.push(admin.id);
        await pool.query(`UPDATE admin_users SET ${updates.join(', ')} WHERE id = ?`, vals);
      }
      return { success: true, message: `Profil Admin '${admin.username}' berhasil diperbarui.` };
    }

    // 2. Update tenant user in `users`
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
      const dbRole = data.role === 'admin' ? 'admin' : 'tenant';
      updates.push('role = ?');
      values.push(dbRole);
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

    const username = users[0].username;
    return { success: true, message: `Profil user '${username}' berhasil diperbarui.` };
  } catch (err: any) {
    console.error('Error updating user:', err);
    return { success: false, error: `Gagal memperbarui user: ${err.message}` };
  }
}

/**
 * Deletes user from MySQL `users` or `admin_users`.
 * Accepts numeric and string/hex IDs.
 */
export async function deleteUser(
  userId: number | string,
  currentSessionUsername?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const pool = getMysqlPool();

  try {
    let users: any[] = [];
    let isFromAdminTable = false;

    // 1. Check in `users`
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

    // 2. Check in `admin_users`
    if (!users || users.length === 0) {
      try {
        const [aRes]: any = await pool.query(
          'SELECT id, username, email, role FROM admin_users WHERE id = ? OR username = ? LIMIT 1',
          [userId, userId]
        );
        if (aRes && aRes.length > 0) {
          users = aRes;
          isFromAdminTable = true;
        }
      } catch {}
    }

    if (!users || users.length === 0) {
      return { success: false, error: 'User tidak ditemukan.' };
    }

    const user = users[0];

    // Prevent deleting own session account to avoid self-lockout
    if (currentSessionUsername && (user.username === currentSessionUsername || String(user.id) === currentSessionUsername)) {
      return { success: false, error: 'Tidak dapat menghapus akun Anda sendiri yang sedang aktif digunakan.' };
    }

    // 3. Delete from MySQL
    if (isFromAdminTable) {
      await pool.query('DELETE FROM admin_users WHERE id = ?', [user.id]);
    } else {
      await pool.query('DELETE FROM users WHERE id = ?', [user.id]);
    }

    // 4. Delete from Better-Auth (optional)
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
      message: `User '${user.username}' berhasil dihapus.`,
    };
  } catch (err: any) {
    console.error('Error deleting user:', err);
    return { success: false, error: `Gagal menghapus user: ${err.message}` };
  }
}
