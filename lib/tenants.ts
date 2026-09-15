import { getMysqlPool } from './mysql';
import { getMongoClient } from './mongodb';
import { getActiveRedisClient } from './redis';
import { createUser } from './users';
import { formatBytes, slugifyCampusName } from './tenant-utils';

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
 */
export async function listTenantsWithStorageMetrics(): Promise<TenantItem[]> {
  const mysqlPool = getMysqlPool();

  // 1. Fetch tenants from MySQL
  const [tenantRows]: any = await mysqlPool.query(`
    SELECT 
      t.id,
      t.tenant_code,
      t.campus_name,
      t.database_name,
      t.redis_prefix,
      t.is_active,
      t.created_at,
      COUNT(u.id) AS user_count
    FROM tenants t
    LEFT JOIN users u ON u.tenant_id = t.id
    GROUP BY t.id
    ORDER BY t.id ASC
  `);

  // 2. Fetch platform_master metadata from MongoDB
  const masterMetaMap: Record<string, any> = {};
  try {
    const mongoClient = await getMongoClient();
    const masterDb = mongoClient.db('platform_master');
    const masterDocs = await masterDb.collection('tenants').find({}).toArray();
    masterDocs.forEach((doc) => {
      if (doc.campus_code) masterMetaMap[doc.campus_code] = doc;
      if (doc.database_name) masterMetaMap[doc.database_name] = doc;
    });
  } catch (mongoErr: any) {
    console.warn('[Mongo master tenants fetch warning]:', mongoErr.message);
  }

  // 3. Connect to Mongo & Redis for real-time stats
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
    const masterMeta = masterMetaMap[row.tenant_code] || masterMetaMap[dbName] || {};

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

    // A. Query Mongo Stats
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

    // B. Query Redis Keys
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
    const status = !isActive ? 'SUSPENDED' : (masterMeta.status || 'ACTIVE');

    results.push({
      id: row.id,
      tenant_code: row.tenant_code,
      campus_name: row.campus_name,
      database_name: row.database_name,
      redis_prefix: row.redis_prefix,
      is_active: row.is_active,
      created_at: row.created_at,
      pic_name: masterMeta.contact?.pic_name || '-',
      pic_email: masterMeta.contact?.pic_email || '-',
      pic_phone: masterMeta.contact?.pic_phone || '-',
      wazuh_group: masterMeta.wazuh_group || dbName,
      agent_id: masterMeta.agent_id || '-',
      agent_name: masterMeta.agent_name || '-',
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
 * 1. Register in MySQL auth_db.tenants
 * 2. Register metadata in MongoDB platform_master.tenants
 * 3. Physical Database creation in MongoDB + 5 core collections with composite indexes
 * 4. Redis cache namespace allocation with zero baseline KPI document
 * 5. Optional initial Admin creation
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
      return { success: false, error: 'Kode Kampus dan Nama Kampus wajib diisi.' };
    }

    // Check MySQL uniqueness
    const [existing]: any = await mysqlPool.query(
      'SELECT id, tenant_code, database_name FROM tenants WHERE tenant_code = ? OR database_name = ? LIMIT 1',
      [tenantCode, databaseName]
    );

    if (existing && existing.length > 0) {
      return {
        success: false,
        error: `Tenant dengan kode '${tenantCode}' atau database '${databaseName}' sudah terdaftar.`,
      };
    }

    // Step 1: MySQL Insertion
    const [insertTenant]: any = await mysqlPool.query(
      'INSERT INTO tenants (tenant_code, campus_name, database_name, redis_prefix, is_active) VALUES (?, ?, ?, ?, 1)',
      [tenantCode, campusName, databaseName, redisPrefix]
    );
    const newTenantId = insertTenant.insertId;

    // Step 2: MongoDB Master Metadata Insertion
    const mongoClient = await getMongoClient();
    const masterDb = mongoClient.db('platform_master');
    const masterTenantsCol = masterDb.collection('tenants');

    const tenantDocId = `TENANT-${tenantCode}-${String(newTenantId).padStart(3, '0')}`;
    const masterDoc = {
      _id: tenantDocId,
      campus_code: tenantCode,
      campus_name: campusName,
      database_name: databaseName,
      wazuh_group: databaseName,
      agent_id: `00${newTenantId}`,
      agent_name: `agent-${slug}`,
      status: 'ACTIVE',
      created_at: new Date(),
      contact: {
        pic_name: payload.picName || `Admin SOC ${campusName}`,
        pic_email: payload.picEmail || `soc@${slug}.ac.id`,
        pic_phone: payload.picPhone || '+62-812-0000-0000',
      },
    };

    await masterTenantsCol.updateOne(
      { campus_code: tenantCode },
      { $set: masterDoc },
      { upsert: true }
    );

    // Step 3: MongoDB Physical Database & 5 Core Collections with Composite Indexes
    const tenantDb = mongoClient.db(databaseName);

    // Collection 1: incident
    const incidentCol = tenantDb.collection('incident');
    await incidentCol.createIndex({ rule_id: 1, agent_id: 1, date: 1 });
    await incidentCol.createIndex({ timestamp: -1 });
    await incidentCol.createIndex({ date: 1 });

    // Collection 2: vulnerability
    const vulnCol = tenantDb.collection('vulnerability');
    await vulnCol.createIndex({ cve: 1, agent: 1, vulnerability: 1 });
    await vulnCol.createIndex({ severity: 1 });

    // Collection 3: devices
    const devicesCol = tenantDb.collection('devices');
    await devicesCol.createIndex({ id: 1 }, { unique: true, sparse: true });
    await devicesCol.createIndex({ ip: 1 });
    await devicesCol.createIndex({ status: 1 });

    // Collection 4: device_summary
    const deviceSummaryCol = tenantDb.collection('device_summary');
    await deviceSummaryCol.createIndex({ tenant_code: 1 });
    await deviceSummaryCol.createIndex({ last_updated: -1 });

    // Collection 5: reports
    const reportsCol = tenantDb.collection('reports');
    await reportsCol.createIndex({ report_id: 1 });
    await reportsCol.createIndex({ case_id: 1 });
    await reportsCol.createIndex({ date: 1 });

    // Insert baseline device_summary document to materialize database immediately
    await deviceSummaryCol.insertOne({
      tenant_code: tenantCode,
      campus_name: campusName,
      database_name: databaseName,
      total_devices: 0,
      active_devices: 0,
      disconnected_devices: 0,
      provisioned_at: new Date(),
      last_updated: new Date(),
    });

    // Step 4: Redis Cache Namespace Allocation
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

    // Step 5: Optional Initial Admin Creation
    let initialAdminCreated = false;
    let initialAdminUsername = '';
    if (payload.createInitialAdmin && payload.adminPassword) {
      initialAdminUsername = `admin_${tenantCode.toLowerCase()}`;
      await createUser({
        username: initialAdminUsername,
        email: payload.picEmail || `admin@${slug}.ac.id`,
        password: payload.adminPassword,
        role: 'tenant_admin',
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
        mongoStatus: 'Database & 5 Indexes Created',
        initialAdminCreated,
        adminUsername: initialAdminCreated ? initialAdminUsername : undefined,
      },
    };
  } catch (err: any) {
    console.error('Error during automated provisioning:', err);
    return {
      success: false,
      error: `Gagal memprovisi tenant: ${err.message}`,
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
      return { success: false, error: 'Tenant tidak ditemukan.' };
    }

    const tenant = rows[0];

    // Handle Status Change
    if (data.status !== undefined) {
      const isActive = data.status === 'ACTIVE' ? 1 : 0;
      await mysqlPool.query('UPDATE tenants SET is_active = ? WHERE id = ?', [isActive, tenantId]);

      // Update in MongoDB platform_master
      try {
        const mongoClient = await getMongoClient();
        const masterDb = mongoClient.db('platform_master');
        await masterDb.collection('tenants').updateOne(
          { campus_code: tenant.tenant_code },
          { $set: { status: data.status, updated_at: new Date() } }
        );
      } catch (mongoErr: any) {
        console.warn('Mongo status update warning:', mongoErr.message);
      }
    }

    // Handle Campus Name & Contact Updates
    if (data.campusName) {
      await mysqlPool.query('UPDATE tenants SET campus_name = ? WHERE id = ?', [
        data.campusName.trim(),
        tenantId,
      ]);
    }

    if (data.picName || data.picEmail || data.picPhone || data.campusName) {
      try {
        const mongoClient = await getMongoClient();
        const masterDb = mongoClient.db('platform_master');
        const updateFields: any = { updated_at: new Date() };

        if (data.campusName) updateFields.campus_name = data.campusName.trim();
        if (data.picName) updateFields['contact.pic_name'] = data.picName.trim();
        if (data.picEmail) updateFields['contact.pic_email'] = data.picEmail.trim();
        if (data.picPhone) updateFields['contact.pic_phone'] = data.picPhone.trim();

        await masterDb.collection('tenants').updateOne(
          { campus_code: tenant.tenant_code },
          { $set: updateFields }
        );
      } catch (mongoErr: any) {
        console.warn('Mongo contact update warning:', mongoErr.message);
      }
    }

    return {
      success: true,
      message: `Tenant ${tenant.campus_name} berhasil diperbarui.`,
    };
  } catch (err: any) {
    console.error('Error updating tenant:', err);
    return { success: false, error: `Gagal memperbarui tenant: ${err.message}` };
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
      return { success: false, error: 'Tenant tidak ditemukan.' };
    }

    const tenant = rows[0];

    // Delete from MySQL tenants
    await mysqlPool.query('DELETE FROM tenants WHERE id = ?', [tenantId]);

    // Update or mark deleted in MongoDB platform_master
    try {
      const mongoClient = await getMongoClient();
      const masterDb = mongoClient.db('platform_master');
      await masterDb.collection('tenants').deleteOne({ campus_code: tenant.tenant_code });
    } catch (mongoErr: any) {
      console.warn('Mongo delete warning:', mongoErr.message);
    }

    return {
      success: true,
      message: `Tenant ${tenant.campus_name} (${tenant.tenant_code}) berhasil dihapus.`,
    };
  } catch (err: any) {
    console.error('Error deleting tenant:', err);
    return { success: false, error: `Gagal menghapus tenant: ${err.message}` };
  }
}
