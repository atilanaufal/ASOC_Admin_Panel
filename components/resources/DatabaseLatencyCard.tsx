'use client';

import React, { useState } from 'react';

export interface DatabaseLatencyItem {
  id: 'mongo' | 'redis';
  name: string;
  role: string;
  target: string;
  readLatencyMs: number;
  writeLatencyMs: number;
  unit: string;
  status: string;
}

export interface LatencyHistoryPoint {
  time: string;
  mongoRead: number;
  mongoWrite: number;
  redisRead: number;
  redisWrite: number;
}

export interface DatabaseLatencyReport {
  timestamp: string;
  engines: {
    mongo: DatabaseLatencyItem;
    redis: DatabaseLatencyItem;
  };
  history: LatencyHistoryPoint[];
}

interface DatabaseLatencyCardProps {
  data?: DatabaseLatencyReport | null;
  loading?: boolean;
}

// Catmull-Rom to Cubic Bezier curve generator
function getSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;

  let d = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

function getSmoothAreaPath(points: { x: number; y: number }[], bottomY: number): string {
  if (points.length === 0) return '';
  const linePath = getSmoothPath(points);
  const lastX = points[points.length - 1].x.toFixed(1);
  const firstX = points[0].x.toFixed(1);
  return `${linePath} L ${lastX},${bottomY} L ${firstX},${bottomY} Z`;
}

export function DatabaseLatencyCard({ data, loading = false }: DatabaseLatencyCardProps) {
  const [metricFilter, setMetricFilter] = useState<'all' | 'read' | 'write'>('all');
  const [selectedEngine, setSelectedEngine] = useState<'all' | 'mongo' | 'redis'>('all');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const engines = data?.engines || {
    mongo: {
      id: 'mongo',
      name: 'MongoDB',
      role: '',
      target: '',
      readLatencyMs: 4.8,
      writeLatencyMs: 16.2,
      unit: 'ms',
      status: 'Normal',
    },
    redis: {
      id: 'redis',
      name: 'Redis',
      role: '',
      target: '',
      readLatencyMs: 0.42,
      writeLatencyMs: 0.68,
      unit: 'ms',
      status: 'Normal',
    },
  };

  const history = data?.history && data.history.length > 0 ? data.history : [
    { time: '11:20', mongoRead: 4.5, mongoWrite: 15.5, redisRead: 0.41, redisWrite: 0.65 },
    { time: '11:25', mongoRead: 5.2, mongoWrite: 17.8, redisRead: 0.45, redisWrite: 0.72 },
    { time: '11:30', mongoRead: 4.3, mongoWrite: 14.2, redisRead: 0.38, redisWrite: 0.61 },
    { time: '11:35', mongoRead: 4.1, mongoWrite: 13.0, redisRead: 0.35, redisWrite: 0.58 },
    { time: '11:40', mongoRead: 5.1, mongoWrite: 17.0, redisRead: 0.44, redisWrite: 0.70 },
    { time: '11:45', mongoRead: 5.6, mongoWrite: 19.0, redisRead: 0.47, redisWrite: 0.76 },
    { time: '11:50', mongoRead: 4.6, mongoWrite: 15.0, redisRead: 0.40, redisWrite: 0.64 },
    { time: '11:55', mongoRead: 4.0, mongoWrite: 12.8, redisRead: 0.35, redisWrite: 0.57 },
    { time: '12:00', mongoRead: 4.9, mongoWrite: 16.5, redisRead: 0.42, redisWrite: 0.68 },
    { time: '12:05', mongoRead: 5.7, mongoWrite: 19.4, redisRead: 0.48, redisWrite: 0.78 },
    { time: '12:10', mongoRead: 4.8, mongoWrite: 16.1, redisRead: 0.42, redisWrite: 0.68 },
  ];

  // Chart coordinate space
  const chartWidth = 720;
  const chartHeight = 250;
  const paddingLeft = 52;
  const paddingRight = 24;
  const paddingTop = 20;
  const paddingBottom = 48; // extra space for timestamp ticks and axis title

  const innerWidth = chartWidth - paddingLeft - paddingRight;
  const innerHeight = chartHeight - paddingTop - paddingBottom;
  const bottomY = paddingTop + innerHeight;

  // Calculate dynamic max value depending on view mode
  let relevantValues: number[] = [];
  history.forEach((pt) => {
    if (selectedEngine === 'mongo') {
      if (metricFilter !== 'write') relevantValues.push(pt.mongoRead);
      if (metricFilter !== 'read') relevantValues.push(pt.mongoWrite);
    } else if (selectedEngine === 'redis') {
      if (metricFilter !== 'write') relevantValues.push(pt.redisRead);
      if (metricFilter !== 'read') relevantValues.push(pt.redisWrite);
    } else {
      // all engines
      if (metricFilter !== 'write') relevantValues.push(pt.mongoRead, pt.redisRead);
      if (metricFilter !== 'read') relevantValues.push(pt.mongoWrite, pt.redisWrite);
    }
  });

  const rawMax = Math.max(...relevantValues, 1);
  const niceMax = selectedEngine === 'redis'
    ? Math.ceil(rawMax * 1.3 * 10) / 10
    : Math.ceil((rawMax * 1.25) / 5) * 5;

  const yTicks = [
    niceMax,
    Math.round((niceMax * 0.75) * 10) / 10,
    Math.round((niceMax * 0.5) * 10) / 10,
    Math.round((niceMax * 0.25) * 10) / 10,
    0,
  ];

  const mapX = (index: number) => {
    if (history.length <= 1) return paddingLeft + innerWidth / 2;
    return paddingLeft + (index / (history.length - 1)) * innerWidth;
  };

  const mapY = (val: number) => {
    const ratio = Math.max(0, Math.min(1, val / niceMax));
    return bottomY - ratio * innerHeight;
  };

  // Series points
  const mongoReadPoints = history.map((pt, i) => ({ x: mapX(i), y: mapY(pt.mongoRead) }));
  const mongoWritePoints = history.map((pt, i) => ({ x: mapX(i), y: mapY(pt.mongoWrite) }));
  const redisReadPoints = history.map((pt, i) => ({ x: mapX(i), y: mapY(pt.redisRead) }));
  const redisWritePoints = history.map((pt, i) => ({ x: mapX(i), y: mapY(pt.redisWrite) }));

  const isSingleEngine = selectedEngine !== 'all';

  // Evenly spaced X-axis ticks (at most 6 ticks so it never overlaps)
  const tickStep = Math.max(1, Math.floor((history.length - 1) / 5));
  const tickIndices = new Set<number>();
  for (let i = 0; i < history.length; i += tickStep) {
    tickIndices.add(i);
  }
  tickIndices.add(history.length - 1);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/60 p-6 shadow-xs">
      {/* Header without icon */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-100 gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800 tracking-tight">
            Database Latency
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Read and write response time in milliseconds (VM Internal)
          </p>
        </div>

        {/* Metric filter buttons */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start sm:self-auto">
          <button
            onClick={() => setMetricFilter('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              metricFilter === 'all'
                ? 'bg-white text-slate-800 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Read & Write
          </button>
          <button
            onClick={() => setMetricFilter('read')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              metricFilter === 'read'
                ? 'bg-white text-slate-800 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Read Only
          </button>
          <button
            onClick={() => setMetricFilter('write')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              metricFilter === 'write'
                ? 'bg-white text-slate-800 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Write Only
          </button>
        </div>
      </div>

      {/* Main Grid: Chart on Left (3 cols), Sidebar on Right (1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 pt-5">
        {/* Left Column: Spline Chart */}
        <div className="lg:col-span-3 flex flex-col justify-between">
          {/* Top Indicators / Legend */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-4 text-xs font-semibold">
              {isSingleEngine ? (
                <>
                  {metricFilter !== 'write' && (
                    <div className="flex items-center gap-2 text-slate-700">
                      <span className="w-4 h-0.5 bg-[#00C4B4] rounded-full inline-block" />
                      <span>Read Latency</span>
                    </div>
                  )}
                  {metricFilter !== 'read' && (
                    <div className="flex items-center gap-2 text-slate-700">
                      <span className="w-4 h-0.5 bg-slate-400 rounded-full inline-block" />
                      <span>Write Latency</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-slate-700">
                    <span className="w-4 h-0.5 bg-[#10B981] rounded-full inline-block" />
                    <span>MongoDB</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-700">
                    <span className="w-4 h-0.5 bg-[#F59E0B] rounded-full inline-block" />
                    <span>Redis</span>
                  </div>
                </>
              )}
            </div>

            {selectedEngine !== 'all' && (
              <button
                onClick={() => setSelectedEngine('all')}
                className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
              >
                Reset Engine View
              </button>
            )}
          </div>

          {/* SVG Spline Graph Container */}
          <div
            className="relative w-full overflow-hidden"
            onMouseLeave={() => setHoverIndex(null)}
          >
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-auto overflow-visible select-none"
            >
              <defs>
                {/* Single engine gradients */}
                <linearGradient id="grad-cyan" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00C4B4" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#00C4B4" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="grad-slate" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#94A3B8" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="#94A3B8" stopOpacity="0.0" />
                </linearGradient>

                {/* All engines gradients */}
                <linearGradient id="grad-mongo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="grad-redis" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.20" />
                  <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Horizontal Gridlines & Y-axis Labels */}
              {yTicks.map((val, idx) => {
                const y = mapY(val);
                return (
                  <g key={`ytick-${idx}`}>
                    <line
                      x1={paddingLeft}
                      y1={y}
                      x2={chartWidth - paddingRight}
                      y2={y}
                      stroke="#F1F5F9"
                      strokeWidth="1"
                    />
                    <text
                      x={paddingLeft - 8}
                      y={y + 3.5}
                      textAnchor="end"
                      className="fill-slate-400 text-[10px] font-mono font-medium"
                    >
                      {val >= 10 ? Math.round(val) : val}
                      <tspan className="text-[8px] fill-slate-300"> ms</tspan>
                    </text>
                  </g>
                );
              })}

              {/* Chart Curves & Areas */}
              {isSingleEngine ? (
                <>
                  {/* Selected Engine Read Curve */}
                  {metricFilter !== 'write' && (
                    <>
                      <path
                        d={getSmoothAreaPath(
                          selectedEngine === 'mongo' ? mongoReadPoints : redisReadPoints,
                          bottomY
                        )}
                        fill="url(#grad-cyan)"
                      />
                      <path
                        d={getSmoothPath(
                          selectedEngine === 'mongo' ? mongoReadPoints : redisReadPoints
                        )}
                        fill="none"
                        stroke="#00C4B4"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </>
                  )}

                  {/* Selected Engine Write Curve */}
                  {metricFilter !== 'read' && (
                    <>
                      <path
                        d={getSmoothAreaPath(
                          selectedEngine === 'mongo' ? mongoWritePoints : redisWritePoints,
                          bottomY
                        )}
                        fill="url(#grad-slate)"
                      />
                      <path
                        d={getSmoothPath(
                          selectedEngine === 'mongo' ? mongoWritePoints : redisWritePoints
                        )}
                        fill="none"
                        stroke="#94A3B8"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </>
                  )}
                </>
              ) : (
                <>
                  {/* All Engines: MongoDB */}
                  {metricFilter !== 'write' && (
                    <>
                      <path d={getSmoothAreaPath(mongoReadPoints, bottomY)} fill="url(#grad-mongo)" />
                      <path
                        d={getSmoothPath(mongoReadPoints)}
                        fill="none"
                        stroke="#10B981"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </>
                  )}
                  {metricFilter === 'write' && (
                    <>
                      <path d={getSmoothAreaPath(mongoWritePoints, bottomY)} fill="url(#grad-mongo)" />
                      <path
                        d={getSmoothPath(mongoWritePoints)}
                        fill="none"
                        stroke="#10B981"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </>
                  )}

                  {/* All Engines: Redis */}
                  {metricFilter !== 'write' && (
                    <>
                      <path d={getSmoothAreaPath(redisReadPoints, bottomY)} fill="url(#grad-redis)" />
                      <path
                        d={getSmoothPath(redisReadPoints)}
                        fill="none"
                        stroke="#F59E0B"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </>
                  )}
                  {metricFilter === 'write' && (
                    <>
                      <path d={getSmoothAreaPath(redisWritePoints, bottomY)} fill="url(#grad-redis)" />
                      <path
                        d={getSmoothPath(redisWritePoints)}
                        fill="none"
                        stroke="#F59E0B"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </>
                  )}
                </>
              )}

              {/* Hover Guideline */}
              {hoverIndex !== null && (
                <line
                  x1={mapX(hoverIndex)}
                  y1={paddingTop}
                  x2={mapX(hoverIndex)}
                  y2={bottomY}
                  stroke="#94A3B8"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
              )}

              {/* Invisible Mouse Hover Target Rectangles */}
              {history.map((_, i) => {
                const x = mapX(i);
                const stepWidth = innerWidth / Math.max(1, history.length - 1);
                return (
                  <rect
                    key={`hit-${i}`}
                    x={x - stepWidth / 2}
                    y={paddingTop}
                    width={stepWidth}
                    height={innerHeight}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => setHoverIndex(i)}
                  />
                );
              })}

              {/* X-axis Ticks (Evenly spaced timestamps) */}
              {history.map((pt, i) => {
                if (!tickIndices.has(i)) return null;
                return (
                  <text
                    key={`xtick-${i}`}
                    x={mapX(i)}
                    y={bottomY + 18}
                    textAnchor="middle"
                    className="fill-slate-500 text-[11px] font-mono font-medium"
                  >
                    {pt.time}
                  </text>
                );
              })}

              {/* X-axis Label / Context */}
              <text
                x={paddingLeft + innerWidth / 2}
                y={bottomY + 36}
                textAnchor="middle"
                className="fill-slate-400 text-[10px] font-semibold tracking-wider uppercase"
              >
                Waktu Pemeriksaan (WIB)
              </text>
            </svg>

            {/* Hover Tooltip Popup - Light Theme */}
            {hoverIndex !== null && history[hoverIndex] && (
              <div
                className="absolute z-20 top-2 pointer-events-none bg-white/95 backdrop-blur-sm border border-slate-200/80 shadow-xl rounded-xl p-3 text-xs space-y-2 transition-all min-w-[190px]"
                style={{
                  left: `${Math.min(
                    70,
                    Math.max(5, (mapX(hoverIndex) / chartWidth) * 100 - 15)
                  )}%`,
                }}
              >
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 text-slate-500 font-mono text-[11px]">
                  <span className="font-semibold">Waktu</span>
                  <span className="font-bold text-slate-700">{history[hoverIndex].time} WIB</span>
                </div>

                {selectedEngine === 'all' ? (
                  <div className="space-y-2">
                    {/* MongoDB breakdown */}
                    <div>
                      <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-xs mb-0.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span>MongoDB</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 pl-3.5 text-[11px] font-mono text-slate-600">
                        <span>Read: <strong className="text-slate-800">{history[hoverIndex].mongoRead}</strong> ms</span>
                        <span>Write: <strong className="text-slate-800">{history[hoverIndex].mongoWrite}</strong> ms</span>
                      </div>
                    </div>

                    {/* Redis breakdown */}
                    <div>
                      <div className="flex items-center gap-1.5 text-amber-700 font-bold text-xs mb-0.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <span>Redis</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 pl-3.5 text-[11px] font-mono text-slate-600">
                        <span>Read: <strong className="text-slate-800">{history[hoverIndex].redisRead}</strong> ms</span>
                        <span>Write: <strong className="text-slate-800">{history[hoverIndex].redisWrite}</strong> ms</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="font-bold text-xs text-slate-800 pb-0.5">
                      {selectedEngine === 'mongo' ? 'MongoDB' : 'Redis'} Latency
                    </div>
                    <div className="space-y-1 text-[11px] font-mono">
                      <div className="flex justify-between items-center text-slate-600">
                        <span className="text-[#00C4B4] font-semibold">Read Latency:</span>
                        <span className="font-bold text-slate-800">
                          {selectedEngine === 'mongo'
                            ? history[hoverIndex].mongoRead
                            : history[hoverIndex].redisRead}{' '}
                          ms
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-slate-600">
                        <span className="text-slate-500 font-semibold">Write Latency:</span>
                        <span className="font-bold text-slate-800">
                          {selectedEngine === 'mongo'
                            ? history[hoverIndex].mongoWrite
                            : history[hoverIndex].redisWrite}{' '}
                          ms
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Clean, Compact Sidebar (No dots, plain names, no IP/port) */}
        <div className="lg:col-span-1 border-t lg:border-t-0 lg:border-l border-slate-100 pt-4 lg:pt-0 lg:pl-6 flex flex-col justify-center space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
            Databases
          </p>

          {/* 1. MongoDB */}
          <div
            onClick={() => setSelectedEngine(selectedEngine === 'mongo' ? 'all' : 'mongo')}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
              selectedEngine === 'mongo'
                ? 'border-emerald-500/60 bg-emerald-50/40 shadow-xs'
                : 'border-slate-200/60 hover:border-slate-300 hover:bg-slate-50/50'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-slate-800">MongoDB</span>
              {selectedEngine === 'mongo' && (
                <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-100/60 px-1.5 py-0.5 rounded">
                  Selected
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block font-medium">Read</span>
                <span className="text-xs font-bold text-slate-700">
                  {engines.mongo.readLatencyMs} ms
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-medium">Write</span>
                <span className="text-xs font-bold text-slate-700">
                  {engines.mongo.writeLatencyMs} ms
                </span>
              </div>
            </div>
          </div>

          {/* 2. Redis */}
          <div
            onClick={() => setSelectedEngine(selectedEngine === 'redis' ? 'all' : 'redis')}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
              selectedEngine === 'redis'
                ? 'border-amber-500/60 bg-amber-50/40 shadow-xs'
                : 'border-slate-200/60 hover:border-slate-300 hover:bg-slate-50/50'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-slate-800">Redis</span>
              {selectedEngine === 'redis' && (
                <span className="text-[10px] font-semibold text-amber-600 bg-amber-100/60 px-1.5 py-0.5 rounded">
                  Selected
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block font-medium">Read</span>
                <span className="text-xs font-bold text-slate-700">
                  {engines.redis.readLatencyMs} ms
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-medium">Write</span>
                <span className="text-xs font-bold text-slate-700">
                  {engines.redis.writeLatencyMs} ms
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
