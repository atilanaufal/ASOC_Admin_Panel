import { getMysqlPool, hashPasswordArgon2id } from './mysql';
import { authDbPool } from './auth';
import crypto from 'crypto';

export interface UserItem {
  id: number | string;
  tenant_id: number;
  username: string;
  role: string;
  created_at: string | Date;
  tenant_code?: string;
  campus_name?: string;
  tenant_is_active?: number | boolean;
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
          COALESCE(role, 'admin') AS role,
          created_at,
          '-' AS tenant_code,
          '-' AS campus_name,
          1 AS tenant_is_active
        FROM admin_users
        WHERE 1=1
      `;
      const adminParams: any[] = [];
      if (params.role === 'superadmin') {
        adminQuery += ` AND role = 'superadmin'`;
      } else if (params.role === 'admin') {
        adminQuery += ` AND (role = 'admin' OR role IS NULL OR role = '')`;
      }
      if (params.search && params.search.trim()) {
        const s = `%${params.search.trim()}%`;
        adminQuery += ` AND (username LIKE ? OR name LIKE ?)`;
        adminParams.push(s, s);
      }
      adminQuery += ` ORDER BY created_at DESC`;
      const [adminRows]: any = await pool.query(adminQuery, adminParams);
      if (Array.isArray(adminRows)) {
        allUsers.push(...adminRows);
      }
    } catch {}
  }

  // 2. Fetch Tenant Users from `users`
  const shouldIncludeTenantUsers = !params.role || params.role === 'all' || params.role === 'user' || params.role === 'tenant';

  if (shouldIncludeTenantUsers) {
    let query = `
      SELECT 
        u.id,
        u.tenant_id,
        COALESCE(u.name, '') AS username,
        u.role,
        u.created_at,
        t.tenant_code,
        t.campus_name,
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
      const dbRole = params.role === 'admin' ? 'admin' : (params.role === 'user' ? 'user' : params.role);
      query += ` AND u.role = ?`;
      queryParams.push(dbRole);
    }

    if (params.search && params.search.trim()) {
      const searchTerm = `%${params.search.trim()}%`;
      query += ` AND (u.name LIKE ? OR t.campus_name LIKE ? OR t.tenant_code LIKE ?)`;
      queryParams.push(searchTerm, searchTerm, searchTerm);
    }

    query += ` ORDER BY u.created_at DESC`;

    try {
      const [rows]: any = await pool.query(query, queryParams);
      if (Array.isArray(rows)) {
        allUsers.push(...rows);
      }
    } catch (e: any) {
      console.error('Error fetching tenant users:', e);
    }
  }

  return allUsers;
}

/**
 * Creates a new user.
 * Role 'superadmin' / 'admin' -> Inserts into `admin_users` without tenant binding.
 * Role 'user' -> Inserts into `users` tied to tenant_id.
 */
export async function createUser(data: {
  username: string;
  password: string;
  role: string;
  tenantId?: number | null;
}): Promise<{ success: boolean; user?: any; error?: string }> {
  const pool = getMysqlPool();

  try {
    const username = data.username.trim();
    const rawRole = (data.role || '').toLowerCase();
    const role = (rawRole === 'superadmin' || rawRole === 'admin') ? rawRole : 'user';
    const passwordHash = await hashPasswordArgon2id(data.password);
    const newId = crypto.randomBytes(16).toString('hex');

    // 1. Check existing in admin_users or users
    const [adminCheck]: any = await pool.query(
      'SELECT id FROM admin_users WHERE username = ? LIMIT 1',
      [username]
    );
    if (adminCheck && adminCheck.length > 0) {
      return { success: false, error: `Pengguna dengan username '${username}' sudah terdaftar sebagai Admin.` };
    }

    const [userCheck]: any = await pool.query(
      'SELECT id FROM users WHERE name = ? LIMIT 1',
      [username]
    );

    if (userCheck && userCheck.length > 0) {
      return { success: false, error: `User with username '${username}' already exists.` };
    }

    // 2. Branch by Role
    if (role === 'superadmin' || role === 'admin') {
      // Platform Admin / Superadmin: stored in `admin_users`, NO tenant binding
      await pool.query(
        'INSERT INTO admin_users (id, username, name, password, role) VALUES (?, ?, ?, ?, ?)',
        [newId, username, username, passwordHash, role]
      );

      return {
        success: true,
        user: {
          id: newId,
          username,
          role,
          tenantId: null,
          campusName: '-',
        },
      };
    }

    // Tenant User: requires valid tenant
    if (!data.tenantId) {
      return { success: false, error: 'tenantId is required for regular users' };
    }
    const tenantId = Number(data.tenantId);
    const [tenants]: any = await pool.query(
      'SELECT tenant_code, campus_name, database_name, redis_prefix FROM tenants WHERE id = ? LIMIT 1',
      [tenantId]
    );
    if (!tenants || tenants.length === 0) {
      return { success: false, error: 'Selected tenant does not exist' };
    }
    const tenantInfo = tenants[0];

    await pool.query(
      'INSERT INTO users (id, tenant_id, name, password, role) VALUES (?, ?, ?, ?, ?)',
      [newId, tenantId, username, passwordHash, 'user']
    );

    return {
      success: true,
      user: {
        id: newId,
        username,
        role: 'user',
        tenantId,
        campusName: tenantInfo.campus_name,
      },
    };
  } catch (err: any) {
    console.error('Error creating user:', err);
    return { success: false, error: `Failed to create user: ${err.message}` };
  }
}

/**
 * Resets user password in MySQL `users` or `admin_users` table.
 */
export async function resetUserPassword(
  userId: number | string,
  newPasswordPlain: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const pool = getMysqlPool();

  try {
    const passwordHash = await hashPasswordArgon2id(newPasswordPlain);

    // 1. Check in `admin_users`
    const [adminRows]: any = await pool.query(
      'SELECT id, username FROM admin_users WHERE id = ? OR username = ? LIMIT 1',
      [userId, userId]
    );

    if (adminRows && adminRows.length > 0) {
      const admin = adminRows[0];
      await pool.query('UPDATE admin_users SET password = ? WHERE id = ?', [passwordHash, admin.id]);
      return { success: true, message: `Password for admin '${admin.username}' updated successfully.` };
    }

    // 2. Check in `users`
    const [userRows]: any = await pool.query(
      'SELECT id, COALESCE(name, "") AS username FROM users WHERE id = ? LIMIT 1',
      [userId]
    );

    if (!userRows || userRows.length === 0) {
      return { success: false, error: 'User not found in authentication database.' };
    }

    const user = userRows[0];
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [passwordHash, user.id]);

    return { success: true, message: `Password for user '${user.username}' updated successfully.` };
  } catch (err: any) {
    console.error('Error resetting password:', err);
    return { success: false, error: `Failed to reset password: ${err.message}` };
  }
}

/**
 * Updates user profile / role / tenant assignment.
 */
export async function updateUser(
  userId: number | string,
  data: {
    username?: string;
    role?: string;
    tenantId?: number;
    name?: string;
  }
): Promise<{ success: boolean; message?: string; error?: string }> {
  const pool = getMysqlPool();

  try {
    // 1. Check if admin
    const [adminRows]: any = await pool.query(
      'SELECT id, username FROM admin_users WHERE id = ? OR username = ? LIMIT 1',
      [userId, userId]
    );

    if (adminRows && adminRows.length > 0) {
      const admin = adminRows[0];
      const updates: string[] = [];
      const vals: any[] = [];
      if (data.name || data.username) {
        updates.push('name = ?');
        vals.push((data.name || data.username || '').trim());
      }
      if (data.role) {
        const adminRole = data.role.toLowerCase() === 'superadmin' ? 'superadmin' : 'admin';
        updates.push('role = ?');
        vals.push(adminRole);
      }
      if (updates.length > 0) {
        vals.push(admin.id);
        await pool.query(`UPDATE admin_users SET ${updates.join(', ')} WHERE id = ?`, vals);
      }
      return { success: true, message: `Admin profile '${admin.username}' successfully updated.` };
    }

    // 2. Update tenant user in `users`
    const [userRows]: any = await pool.query(
      'SELECT id, COALESCE(name, "") AS username FROM users WHERE id = ? LIMIT 1',
      [userId]
    );

    if (!userRows || userRows.length === 0) {
      return { success: false, error: 'User not found.' };
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (data.role !== undefined) {
      updates.push('role = ?');
      values.push(data.role || 'user');
    }
    if (data.tenantId !== undefined) {
      updates.push('tenant_id = ?');
      values.push(data.tenantId);
    }
    if (data.username !== undefined || data.name !== undefined) {
      const newName = (data.username || data.name || '').trim();
      updates.push('name = ?');
      values.push(newName);
    }

    if (updates.length > 0) {
      values.push(userId);
      await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    const username = userRows[0].username;
    return { success: true, message: `User profile '${username}' successfully updated.` };
  } catch (err: any) {
    console.error('Error updating user:', err);
    return { success: false, error: `Failed to update user: ${err.message}` };
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
    const [uRes]: any = await pool.query(
      'SELECT id, COALESCE(name, "") AS username, role FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    if (uRes && uRes.length > 0) {
      users = uRes;
    }

    // 2. Check in `admin_users`
    if (!users || users.length === 0) {
      const [aRes]: any = await pool.query(
        'SELECT id, username, role FROM admin_users WHERE id = ? OR username = ? LIMIT 1',
        [userId, userId]
      );
      if (aRes && aRes.length > 0) {
        users = aRes;
        isFromAdminTable = true;
      }
    }

    if (!users || users.length === 0) {
      return { success: false, error: 'User not found.' };
    }

    const user = users[0];

    // Prevent deleting own session account to avoid self-lockout
    if (currentSessionUsername && (user.username === currentSessionUsername || String(user.id) === currentSessionUsername)) {
      return { success: false, error: 'Cannot delete your own active session account.' };
    }

    // 3. Delete from MySQL
    if (isFromAdminTable) {
      await pool.query('DELETE FROM admin_users WHERE id = ?', [user.id]);
    } else {
      await pool.query('DELETE FROM users WHERE id = ?', [user.id]);
    }

    return { success: true, message: `User '${user.username}' successfully deleted.` };
  } catch (err: any) {
    console.error('Error deleting user:', err);
    return { success: false, error: `Failed to delete user: ${err.message}` };
  }
}
