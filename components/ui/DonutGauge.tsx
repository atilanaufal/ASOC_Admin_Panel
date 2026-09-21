'use client';
import React from 'react';

interface DonutGaugeProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  label?: string | number;
  sublabel?: string;
  showPercentSign?: boolean;
}

export function DonutGauge({
  percentage,
  size = 110,
  strokeWidth = 10,
  color = '#0066FF',
  trackColor = '#F0F4F8',
  label,
  sublabel,
  showPercentSign = true,
}: DonutGaugeProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(percentage, 0), 100);
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  const displayLabel = label !== undefined ? label : `${percentage}${showPercentSign ? '%' : ''}`;

  return (
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
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress stroke */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      {/* Centered label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center select-none pointer-events-none">
        <span className="font-extrabold text-slate-900 tracking-tight leading-none text-xl md:text-2xl">
          {displayLabel}
        </span>
        {sublabel && (
          <span className="text-[10px] text-slate-400 font-medium mt-0.5">
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}
