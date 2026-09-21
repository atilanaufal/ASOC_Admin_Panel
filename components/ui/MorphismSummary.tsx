'use client';

import React from 'react';

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

export interface MetricCardItem {
  value: string | number;
  label: string;
  color?: 'rose' | 'amber' | 'cyan' | 'indigo' | 'emerald';
}

interface MorphismSummaryProps {
  title: string;
  donutSegments: DonutSegment[];
  centerLabel?: string | number;
  centerSublabel?: string;
  metrics: [MetricCardItem, MetricCardItem, MetricCardItem];
  className?: string;
}

export function MorphismSummary({
  title,
  donutSegments,
  centerLabel,
  centerSublabel,
  metrics,
  className = '',
}: MorphismSummaryProps) {
  const totalValue = donutSegments.reduce((sum, seg) => sum + (seg.value > 0 ? seg.value : 0), 0);
  const size = 130;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Compute SVG segment offsets
  let accumulatedOffset = 0;
  const renderedSegments = donutSegments.map((seg) => {
    const validVal = seg.value > 0 ? seg.value : 0;
    const fraction = totalValue > 0 ? validVal / totalValue : 0;
    const strokeDash = fraction * circumference;
    const offset = -accumulatedOffset;
    accumulatedOffset += strokeDash;

    return {
      ...seg,
      strokeDasharray: `${strokeDash} ${circumference}`,
      strokeDashoffset: offset,
    };
  });

  const getMetricColorClass = (color?: string) => {
    switch (color) {
      case 'rose':
        return 'text-rose-500';
      case 'amber':
        return 'text-amber-500';
      case 'cyan':
        return 'text-[#00BCD4]';
      case 'indigo':
        return 'text-indigo-500';
      case 'emerald':
        return 'text-emerald-500';
      default:
        return 'text-slate-800';
    }
  };

  return (
    <div className={`grid grid-cols-1 lg:grid-cols-12 gap-5 ${className}`}>
      {/* Left Widget: Donut Chart + Legend */}
      <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/60 p-5 shadow-xs flex flex-col justify-between">
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
          {title}
        </h3>

        <div className="flex flex-col items-center justify-center my-auto py-2">
          <div
            className="relative flex items-center justify-center flex-shrink-0"
            style={{ width: size, height: size }}
          >
            <svg
              width={size}
              height={size}
              viewBox={`0 0 ${size} ${size}`}
              className="transform -rotate-90"
            >
              {/* Background Track */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke="#F0F4F8"
                strokeWidth={strokeWidth}
                fill="none"
              />
              {/* Colored Segments */}
              {totalValue > 0 ? (
                renderedSegments.map((seg, idx) => (
                  <circle
                    key={idx}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={seg.color}
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeDasharray={seg.strokeDasharray}
                    strokeDashoffset={seg.strokeDashoffset}
                    className="transition-all duration-700 ease-out"
                  />
                ))
              ) : (
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke="#E2E8F0"
                  strokeWidth={strokeWidth}
                  fill="none"
                />
              )}
            </svg>

            {/* Optional Center Content */}
            {(centerLabel !== undefined || centerSublabel) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center select-none pointer-events-none">
                {centerLabel !== undefined && (
                  <span className="font-extrabold text-slate-800 tracking-tight leading-none text-xl">
                    {centerLabel}
                  </span>
                )}
                {centerSublabel && (
                  <span className="text-[10px] text-slate-400 font-medium mt-0.5">
                    {centerSublabel}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Donut Legend */}
          <div className="flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1.5 mt-4">
            {donutSegments.map((seg, idx) => (
              <div key={idx} className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: seg.color }}
                />
                <span>{seg.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Row: 3 Elevated Metric Cards */}
      <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {metrics.map((m, idx) => (
          <div
            key={idx}
            className="bg-white rounded-2xl border border-slate-200/60 p-6 shadow-xs flex flex-col items-center justify-center text-center transition-all hover:shadow-sm"
          >
            <div
              className={`text-3xl sm:text-4xl font-extrabold tracking-tight font-mono ${getMetricColorClass(
                m.color
              )}`}
            >
              {m.value}
            </div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-2.5">
              {m.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
