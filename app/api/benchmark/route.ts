import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getActiveRedisClient } from '@/lib/redis';
import { getMongoClient } from '@/lib/mongodb';
import { getMysqlPool } from '@/lib/mysql';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const iterations = Math.min(Math.max(body.iterations || 100, 10), 500);

    const benchmarkResults: Record<string, any> = {};

    // 1. Benchmark Redis (Sub-millisecond test)
    const redisClient = await getActiveRedisClient();
    if (redisClient) {
      const redisWriteKey = `benchmark:test:${Date.now()}`;
      const writeStart = performance.now();

      // Batch pipeline writes
      const pipeline = redisClient.pipeline();
      for (let i = 0; i < iterations; i++) {
        pipeline.set(`${redisWriteKey}:${i}`, `benchmark_val_${i}`, 'EX', 60);
      }
      await pipeline.exec();
      const writeDuration = performance.now() - writeStart;

      // Batch pipeline reads
      const readStart = performance.now();
      const readPipeline = redisClient.pipeline();
      for (let i = 0; i < iterations; i++) {
        readPipeline.get(`${redisWriteKey}:${i}`);
      }
      await readPipeline.exec();
      const readDuration = performance.now() - readStart;

      // Cleanup
      const cleanPipeline = redisClient.pipeline();
      for (let i = 0; i < iterations; i++) {
        cleanPipeline.del(`${redisWriteKey}:${i}`);
      }
      await cleanPipeline.exec();

      const totalTime = writeDuration + readDuration;
      const totalOps = iterations * 2;
      const opsPerSec = Math.round((totalOps / (totalTime / 1000)));

      benchmarkResults['redis'] = {
        engine: 'Redis 7.x (L1 In-Memory)',
        status: 'PASSED',
        iterations,
        writeLatencyAvgMs: Number((writeDuration / iterations).toFixed(3)),
        readLatencyAvgMs: Number((readDuration / iterations).toFixed(3)),
        totalDurationMs: Number(totalTime.toFixed(2)),
        throughputOpsSec: opsPerSec,
      };
    } else {
      benchmarkResults['redis'] = { status: 'OFFLINE' };
    }

    // 2. Benchmark MongoDB (Insert & Find)
    try {
      const mongoClient = await getMongoClient();
      const db = mongoClient.db('tenant_a');
      const testCol = db.collection('benchmark_test');

      const mongoStart = performance.now();
      const docs = Array.from({ length: iterations }, (_, i) => ({
        bench_id: i,
        timestamp: new Date(),
        payload: `benchmark_data_${i}`,
      }));

      // Insert Many
      const insertStart = performance.now();
      await testCol.insertMany(docs);
      const insertDuration = performance.now() - insertStart;

      // Find Many
      const findStart = performance.now();
      await testCol.find({}).limit(iterations).toArray();
      const findDuration = performance.now() - findStart;

      // Clean up
      await testCol.deleteMany({});

      const totalMongoTime = insertDuration + findDuration;
      const opsSec = Math.round((iterations * 2 / (totalMongoTime / 1000)));

      benchmarkResults['mongodb'] = {
        engine: 'MongoDB 7.0 (Document Database)',
        status: 'PASSED',
        iterations,
        insertLatencyAvgMs: Number((insertDuration / iterations).toFixed(3)),
        findLatencyAvgMs: Number((findDuration / iterations).toFixed(3)),
        totalDurationMs: Number(totalMongoTime.toFixed(2)),
        throughputOpsSec: opsSec,
      };
    } catch (err: any) {
      benchmarkResults['mongodb'] = { status: 'ERROR', error: err.message };
    }

    // 3. Benchmark MySQL (Auth Database Queries)
    try {
      const pool = getMysqlPool();
      const mysqlStart = performance.now();

      for (let i = 0; i < Math.min(iterations, 50); i++) {
        try {
          await pool.query('SELECT id, name FROM users LIMIT 5');
        } catch {
          await pool.query('SELECT id FROM users LIMIT 5');
        }
      }
      const mysqlDuration = performance.now() - mysqlStart;
      const mysqlOps = Math.min(iterations, 50);

      benchmarkResults['mysql'] = {
        engine: 'MySQL 8.0 (auth_db)',
        status: 'PASSED',
        iterations: mysqlOps,
        queryLatencyAvgMs: Number((mysqlDuration / mysqlOps).toFixed(3)),
        totalDurationMs: Number(mysqlDuration.toFixed(2)),
        throughputOpsSec: Math.round((mysqlOps / (mysqlDuration / 1000))),
      };
    } catch (err: any) {
      benchmarkResults['mysql'] = { status: 'ERROR', error: err.message };
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      testedIterations: iterations,
      results: benchmarkResults,
    });
  } catch (error: any) {
    console.error('Benchmark API Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to execute database benchmark.' },
      { status: 500 }
    );
  }
}
