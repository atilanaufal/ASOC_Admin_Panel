import { NextRequest } from 'next/server';
import { getMysqlPool } from './mysql';
import { getMongoClient } from './mongodb';

export interface AuditLogEntry {
  id?: number;
  timestamp?: string | Date;
  adminId?: number;
  adminUsername: string;
  ipAddress: string;
  userAgent?: string;
  actionType: string;
  targetResource?: string;
  status: 'SUCCESS' | 'FAILED';
  details?: any;
}

export interface GetAuditLogsParams {
  page?: number;
  limit?: number;
  search?: string;
  actionType?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

let tableInitialized = false;

/**
 * Initializes the admin_audit_logs table in MySQL if not already present.
 */
export async function ensureAuditTable(): Promise<void> {
  if (tableInitialized) return;
  try {
    const pool = getMysqlPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        admin_id VARCHAR(191) DEFAULT '0',
        admin_username VARCHAR(100) NOT NULL,
        ip_address VARCHAR(45) NOT NULL,
        user_agent TEXT,
        action_type VARCHAR(50) NOT NULL,
        target_resource VARCHAR(150),
        status ENUM('SUCCESS', 'FAILED') DEFAULT 'SUCCESS',
        details JSON,
        INDEX idx_action (action_type),
        INDEX idx_timestamp (timestamp)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    tableInitialized = true;
  } catch (err: any) {
    console.warn('[Audit Logger MySQL Init Notice]:', err.message);
  }
}

export function extractClientIp(req?: NextRequest | Request | null): string {
  if (!req) return '127.0.0.1';
  try {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    const realIp = req.headers.get('x-real-ip');
    if (realIp) return realIp.trim();
  } catch {}
  return '127.0.0.1';
}

export function extractUserAgent(req?: NextRequest | Request | null): string {
  if (!req) return 'Internal System';
  try {
    return req.headers.get('user-agent') || 'Browser Client';
  } catch {
    return 'Unknown';
  }
}

/**
 * Logs an administrative activity asynchronously (non-blocking).
 */
export async function logAdminActivity(entry: {
  req?: NextRequest | Request | null;
  adminId?: number;
  adminUsername?: string;
  actionType: string;
  targetResource?: string;
  status?: 'SUCCESS' | 'FAILED';
  details?: any;
}): Promise<void> {
  const adminUsername = entry.adminUsername || 'superadmin';
  const adminId = entry.adminId || 7;
  const ipAddress = extractClientIp(entry.req);
  const userAgent = extractUserAgent(entry.req);
  const status = entry.status || 'SUCCESS';
  const actionType = entry.actionType.toUpperCase();
  const targetResource = entry.targetResource || '-';
  const details = entry.details || {};

  // Fire and forget (don't block calling thread)
  (async () => {
    try {
      await ensureAuditTable();
      const pool = getMysqlPool();
      await pool.query(
        `INSERT INTO admin_audit_logs 
          (admin_id, admin_username, ip_address, user_agent, action_type, target_resource, status, details) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          adminId,
          adminUsername,
          ipAddress,
          userAgent,
          actionType,
          targetResource,
          status,
          JSON.stringify(details),
        ]
      );
    } catch (mysqlErr: any) {
      // Fallback: Log to MongoDB platform_master.admin_audit_logs
      try {
        const mongoClient = await getMongoClient();
        const masterDb = mongoClient.db('platform_master');
        await masterDb.collection('admin_audit_logs').insertOne({
          admin_id: adminId,
          admin_username: adminUsername,
          ip_address: ipAddress,
          user_agent: userAgent,
          action_type: actionType,
          target_resource: targetResource,
          status,
          details,
          timestamp: new Date(),
        });
      } catch (mongoErr: any) {
        console.error('[Audit Logger Mongo Fallback Error]:', mongoErr.message);
      }
    }
  })();
}

/**
 * Queries audit logs with pagination and multi-dimensional filtering.
 */
export async function queryAuditLogs(params: GetAuditLogsParams = {}): Promise<{
  logs: any[];
  pagination: {
    currentPage: number;
    pageSize: number;
    totalRecords: number;
    totalPages: number;
  };
}> {
  await ensureAuditTable();
  const pool = getMysqlPool();

  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(params.limit) || 25));
  const offset = (page - 1) * limit;

  let whereClauses: string[] = ['1=1'];
  const queryParams: any[] = [];

  if (params.actionType && params.actionType !== 'all') {
    whereClauses.push('action_type = ?');
    queryParams.push(params.actionType);
  }

  if (params.status && params.status !== 'all') {
    whereClauses.push('status = ?');
    queryParams.push(params.status.toUpperCase());
  }

  if (params.startDate) {
    whereClauses.push('timestamp >= ?');
    queryParams.push(`${params.startDate} 00:00:00`);
  }

  if (params.endDate) {
    whereClauses.push('timestamp <= ?');
    queryParams.push(`${params.endDate} 23:59:59`);
  }

  if (params.search && params.search.trim()) {
    const term = `%${params.search.trim()}%`;
    whereClauses.push('(admin_username LIKE ? OR target_resource LIKE ? OR ip_address LIKE ? OR action_type LIKE ?)');
    queryParams.push(term, term, term, term);
  }

  const whereSql = whereClauses.join(' AND ');

  try {
    // Count total
    const [countRows]: any = await pool.query(
      `SELECT COUNT(*) as total FROM admin_audit_logs WHERE ${whereSql}`,
      queryParams
    );
    const totalRecords = countRows[0]?.total || 0;
    const totalPages = Math.ceil(totalRecords / limit) || 1;

    // Fetch paginated records
    const [rows]: any = await pool.query(
      `SELECT 
        id, 
        DATE_FORMAT(timestamp, '%Y-%m-%d %H:%i:%s WIB') as formatted_timestamp,
        timestamp, 
        admin_id as adminId, 
        admin_username as adminUsername, 
        ip_address as ipAddress, 
        user_agent as userAgent, 
        action_type as actionType, 
        target_resource as targetResource, 
        status, 
        details 
       FROM admin_audit_logs 
       WHERE ${whereSql} 
       ORDER BY id DESC 
       LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    const logs = (rows || []).map((r: any) => ({
      id: r.id,
      timestamp: r.formatted_timestamp || r.timestamp,
      adminUsername: r.adminUsername,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      actionType: r.actionType,
      targetResource: r.targetResource,
      status: r.status,
      details: typeof r.details === 'string' ? JSON.parse(r.details || '{}') : r.details || {},
    }));

    return {
      logs,
      pagination: {
        currentPage: page,
        pageSize: limit,
        totalRecords,
        totalPages,
      },
    };
  } catch (err: any) {
    console.error('Error querying audit logs from MySQL:', err.message);
    return {
      logs: [],
      pagination: {
        currentPage: page,
        pageSize: limit,
        totalRecords: 0,
        totalPages: 1,
      },
    };
  }
}
