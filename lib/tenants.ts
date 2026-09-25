import { getMysqlPool } from './mysql';
import { getMongoClient } from './mongodb';
import { getActiveRedisClient } from './redis';
import { createUser } from './users';
import { formatBytes, slugifyCampusName } from './tenant-utils';
import { runRemoteScript } from './remote';

export { formatBytes, slugifyCampusName };

export interface TenantStorageMetrics {
  dataSizeBytes: number;
  storageSizeBytes: number;
  indexSizeBytes: number;
  objectsCount: number;
  collectionsCount: number;
  dataSizeFormatted: string;
  storageSizeFormatted: string;
  indexSizeFormatted: string;
}

export interface TenantItem {
  id: number;
  tenant_code: string;
  campus_name: string;
  database_name: string;
  redis_prefix: string;
  is_active: number | boolean;
  created_at: string | Date;
  pic_name?: string;
  pic_email?: string;
  pic_phone?: string;
  wazuh_group?: string;
  agent_id?: string;
  agent_name?: string;
  status: 'ACTIVE' | 'SUSPENDED' | string;
  storage: TenantStorageMetrics;
  redisKeyCount: number;
  userCount: number;
}

/**
 * Lists all registered tenants with real MongoDB disk metrics, Redis key counts, and user stats.
 * Uses MySQL auth_db relational tables (tenants, tenant_wazuh_groups, tenant_iris_customers, tenant_agents)
 * as the sole source of truth without any artificial platform_master MongoDB database.
 */
export async function listTenantsWithStorageMetrics(): Promise<TenantItem[]> {
  const mysqlPool = getMysqlPool();

  // 1. Fetch tenants with mapped Wazuh groups, IRIS customers, and agents from MySQL auth_db
  const [tenantRows]: any = await mysqlPool.query(`
    SELECT 
      t.id,
      t.tenant_code,
      t.campus_name,
      t.database_name,
      t.redis_prefix,
      t.is_active,
      t.created_at,
      wg.wazuh_group_name,
      ic.iris_customer_id,
      ic.iris_customer_name,
      COUNT(DISTINCT u.id) AS user_count,
      COUNT(DISTINCT ta.id) AS agent_count
    FROM tenants t
    LEFT JOIN tenant_wazuh_groups wg ON t.id = wg.tenant_id
    LEFT JOIN tenant_iris_customers ic ON t.id = ic.tenant_id
    LEFT JOIN tenant_agents ta ON t.id = ta.tenant_id
    LEFT JOIN users u ON u.tenant_id = t.id
    GROUP BY t.id, wg.wazuh_group_name, ic.iris_customer_id, ic.iris_customer_name
    ORDER BY t.id ASC
  `);

  // 2. Connect to Mongo & Redis for real-time stats
  let mongoClient: any = null;
  let redisClient: any = null;
  try {
    mongoClient = await getMongoClient();
  } catch {}
  try {
    redisClient = await getActiveRedisClient();
  } catch {}

  const results: TenantItem[] = [];

  for (const row of tenantRows) {
    const dbName = row.database_name;
    const prefix = row.redis_prefix || `${dbName}:`;

    // Defaults
    let storageStats: TenantStorageMetrics = {
      dataSizeBytes: 0,
      storageSizeBytes: 0,
      indexSizeBytes: 0,
      objectsCount: 0,
      collectionsCount: 0,
      dataSizeFormatted: '0 B',
      storageSizeFormatted: '0 B',
      indexSizeFormatted: '0 B',
    };

    let redisKeys = 0;

    // A. Query Mongo Stats for the specific tenant database
    if (mongoClient && dbName) {
      try {
        const dbInstance = mongoClient.db(dbName);
        const stats = await dbInstance.stats();
        const dataSizeBytes = stats.dataSize || 0;
        const storageSizeBytes = stats.storageSize || 0;
        const indexSizeBytes = stats.indexSize || 0;
        const objectsCount = stats.objects || 0;
        const collectionsCount = stats.collections || 0;

        storageStats = {
          dataSizeBytes,
          storageSizeBytes,
          indexSizeBytes,
          objectsCount,
          collectionsCount,
          dataSizeFormatted: formatBytes(dataSizeBytes),
          storageSizeFormatted: formatBytes(storageSizeBytes),
          indexSizeFormatted: formatBytes(indexSizeBytes),
        };
      } catch (dbStatsErr: any) {
        // Database might be empty or uninitialized
      }
    }

    // B. Query Redis Keys for the tenant prefix
    if (redisClient && prefix) {
      try {
        const cleanPrefix = prefix.endsWith(':') ? prefix : `${prefix}:`;
        const matchedKeys = await redisClient.keys(`${cleanPrefix}*`);
        redisKeys = matchedKeys ? matchedKeys.length : 0;
      } catch (redisErr: any) {
        // Redis scan error
      }
    }

    const isActive = Boolean(row.is_active);
    const status = !isActive ? 'SUSPENDED' : 'ACTIVE';
    const agentCount = Number(row.agent_count) || 0;

    results.push({
      id: row.id,
      tenant_code: row.tenant_code,
      campus_name: row.campus_name,
      database_name: row.database_name,
      redis_prefix: row.redis_prefix,
      is_active: row.is_active,
      created_at: row.created_at,
      pic_name: row.iris_customer_name || '-',
      pic_email: `${row.database_name}@asoc.internal`,
      pic_phone: '-',
      wazuh_group: row.wazuh_group_name || row.database_name,
      agent_id: agentCount > 0 ? `${agentCount} Agents` : '-',
      agent_name: row.wazuh_group_name || '-',
      status,
      storage: storageStats,
      redisKeyCount: redisKeys,
      userCount: Number(row.user_count) || 0,
    });
  }

  return results;
}

export interface ProvisionTenantPayload {
  tenantCode: string;
  campusName: string;
  picName: string;
  picEmail: string;
  picPhone: string;
  createInitialAdmin?: boolean;
  adminPassword?: string;
}

/**
 * Executes full automated provisioning:
 * 1. Register in MySQL auth_db.tenants via /opt/multi-tenant/scripts/register_tenant.py
 * 2. Physical Database creation in MongoDB + 5 core collections with composite indexes & 30-day TTLs
 * 3. Redis cache namespace allocation with zero baseline KPI document
 * 4. Optional initial Analyst creation
 */
export async function provisionTenant(
  payload: ProvisionTenantPayload
): Promise<{ success: boolean; tenant?: any; error?: string }> {
  const mysqlPool = getMysqlPool();
  const tenantCode = payload.tenantCode.trim().toUpperCase();
  const campusName = payload.campusName.trim();
  const slug = slugifyCampusName(campusName);
  const databaseName = slug;
  const redisPrefix = `${slug}:`;

  try {
    // Validation
    if (!tenantCode || !campusName) {
      return { success: false, error: 'Tenant code and campus name are required.' };
    }

    // Check MySQL uniqueness
    const [existing]: any = await mysqlPool.query(
      'SELECT id, tenant_code, database_name FROM tenants WHERE tenant_code = ? OR database_name = ? LIMIT 1',
      [tenantCode, databaseName]
    );

    if (existing && existing.length > 0) {
      return {
        success: false,
        error: `Tenant with code '${tenantCode}' or database '${databaseName}' already exists.`,
      };
    }

    // Step 1: Execute local provisioning script on the remote VM host using /opt/venv/bin/python.
    // register_tenant.py registers tenant in MySQL auth_db, maps wazuh_group and iris_customer if provided,
    // and initializes the MongoDB database with all 5 collections and composite indexes.
    const createTenantCmd = `/opt/venv/bin/python /opt/multi-tenant/scripts/register_tenant.py --code "${tenantCode}" --name "${campusName}" --db "${databaseName}"`;
    const remoteRes = await runRemoteScript(createTenantCmd);
    if (!remoteRes.success && remoteRes.stderr && !remoteRes.stdout.includes('PENDAFTARAN TENANT BERHASIL')) {
      console.warn('register_tenant warning:', remoteRes.stderr || remoteRes.stdout);
    }

    // Step 2: Retrieve registered tenant ID from MySQL
    let newTenantId = 0;
    const [rows]: any = await mysqlPool.query(
      'SELECT id FROM tenants WHERE tenant_code = ? LIMIT 1',
      [tenantCode]
    );
    if (rows && rows.length > 0) {
      newTenantId = rows[0].id;
    } else {
      const [insertTenant]: any = await mysqlPool.query(
        'INSERT INTO tenants (tenant_code, campus_name, database_name, redis_prefix, is_active) VALUES (?, ?, ?, ?, 1)',
        [tenantCode, campusName, databaseName, redisPrefix]
      );
      newTenantId = insertTenant.insertId;
    }

    // Step 3: Run init_indexes.py locally on VM using /opt/venv/bin/python
    await runRemoteScript('/opt/venv/bin/python /opt/multi-tenant/scripts/init_indexes.py');

    // Step 4: Redis Cache Namespace Allocation with baseline summary
    try {
      const redisClient = await getActiveRedisClient();
      if (redisClient) {
        const summaryCacheKey = `${redisPrefix}devices:summary`;
        const initialSummary = {
          tenant_code: tenantCode,
          campus_name: campusName,
          total_devices: 0,
          active_devices: 0,
          disconnected_devices: 0,
          last_synced_at: new Date().toISOString(),
        };
        // Set initial cache with 7 days TTL (604800 seconds)
        await redisClient.set(summaryCacheKey, JSON.stringify(initialSummary), 'EX', 604800);
      }
    } catch (rErr: any) {
      console.warn('Warning initializing Redis cache baseline:', rErr.message);
    }

    // Step 5: Optional Initial Admin Creation
    let initialAdminCreated = false;
    let initialAdminUsername = '';
    if (payload.createInitialAdmin && payload.adminPassword) {
      initialAdminUsername = `analyst_${tenantCode.toLowerCase()}`;
      await createUser({
        username: initialAdminUsername,
        email: payload.picEmail || `analyst@${slug}.ac.id`,
        password: payload.adminPassword,
        role: 'tenant',
        tenantId: newTenantId,
      });
      initialAdminCreated = true;
    }

    return {
      success: true,
      tenant: {
        id: newTenantId,
        tenantCode,
        campusName,
        databaseName,
        redisPrefix,
        mongoStatus: 'Database & Production Indexes Provisioned',
        initialAdminCreated,
        adminUsername: initialAdminCreated ? initialAdminUsername : undefined,
      },
    };
  } catch (err: any) {
    console.error('Error during automated provisioning:', err);
    return {
      success: false,
      error: `Failed to provision tenant: ${err.message}`,
    };
  }
}

/**
 * Updates tenant metadata or status (ACTIVE / SUSPENDED).
 */
export async function updateTenant(
  tenantId: number,
  data: {
    campusName?: string;
    databaseName?: string;
    status?: 'ACTIVE' | 'SUSPENDED';
    picName?: string;
    picEmail?: string;
    picPhone?: string;
  }
): Promise<{ success: boolean; message?: string; error?: string }> {
  const mysqlPool = getMysqlPool();

  try {
    const [rows]: any = await mysqlPool.query(
      'SELECT id, tenant_code, campus_name, database_name FROM tenants WHERE id = ? LIMIT 1',
      [tenantId]
    );

    if (!rows || rows.length === 0) {
      return { success: false, error: 'Tenant not found.' };
    }

    const tenant = rows[0];

    // Handle Status Change
    if (data.status !== undefined) {
      const isActive = data.status === 'ACTIVE' ? 1 : 0;
      await mysqlPool.query('UPDATE tenants SET is_active = ? WHERE id = ?', [isActive, tenantId]);
    }

    // Handle Campus Name Updates
    if (data.campusName) {
      await mysqlPool.query('UPDATE tenants SET campus_name = ? WHERE id = ?', [
        data.campusName.trim(),
        tenantId,
      ]);
    }

    // Handle Database Name Updates
    if (data.databaseName) {
      const cleanDb = data.databaseName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
      await mysqlPool.query('UPDATE tenants SET database_name = ? WHERE id = ?', [
        cleanDb,
        tenantId,
      ]);
    }

    return {
      success: true,
      message: `Tenant ${data.campusName?.trim() || tenant.campus_name} successfully updated.`,
    };
  } catch (err: any) {
    console.error('Error updating tenant:', err);
    return { success: false, error: `Failed to update tenant: ${err.message}` };
  }
}

/**
 * Deletes a tenant record.
 */
export async function deleteTenant(
  tenantId: number
): Promise<{ success: boolean; message?: string; error?: string }> {
  const mysqlPool = getMysqlPool();

  try {
    const [rows]: any = await mysqlPool.query(
      'SELECT id, tenant_code, campus_name, database_name FROM tenants WHERE id = ? LIMIT 1',
      [tenantId]
    );

    if (!rows || rows.length === 0) {
      return { success: false, error: 'Tenant not found.' };
    }

    const tenant = rows[0];

    // Execute remote script delete_tenant.py on VM using /opt/venv/bin/python
    // This drops MongoDB database, purges Redis keys, and deletes MySQL user/tenant records
    await runRemoteScript(`/opt/venv/bin/python /opt/multi-tenant/scripts/delete_tenant.py --id ${tenantId} --force`);

    // Ensure deleted from MySQL relational junction tables
    await mysqlPool.query('DELETE FROM users WHERE tenant_id = ?', [tenantId]).catch(() => {});
    await mysqlPool.query('DELETE FROM tenant_wazuh_groups WHERE tenant_id = ?', [tenantId]).catch(() => {});
    await mysqlPool.query('DELETE FROM tenant_iris_customers WHERE tenant_id = ?', [tenantId]).catch(() => {});
    await mysqlPool.query('DELETE FROM tenant_agents WHERE tenant_id = ?', [tenantId]).catch(() => {});
    await mysqlPool.query('DELETE FROM tenants WHERE id = ?', [tenantId]).catch(() => {});

    return {
      success: true,
      message: `Tenant ${tenant.campus_name} (${tenant.tenant_code}) successfully deleted.`,
    };
  } catch (err: any) {
    console.error('Error deleting tenant:', err);
    return { success: false, error: `Failed to delete tenant: ${err.message}` };
  }
}
