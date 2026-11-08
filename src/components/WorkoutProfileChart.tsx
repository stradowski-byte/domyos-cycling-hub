import React from 'react';
import {
  AthleteProfile,
  TelemetryRecord,
  WorkoutBlock,
} from '../types/cycling';
import {
  calculateBlockInstantTarget,
  getPowerZoneForWatts,
} from '../services/rampAndPhysiologyEngine';

interface WorkoutProfileChartProps {
  blocks: WorkoutBlock[];
  profile: AthleteProfile;
  biasPercent?: number;
  currentBlockIndex?: number;
  elapsedInBlockSec?: number;
  liveRecords?: TelemetryRecord[];
  height?: number;
  compact?: boolean;
  onSelectBlock?: (index: number) => void;
}

export const WorkoutProfileChart: React.FC<WorkoutProfileChartProps> = ({
  blocks,
  profile,
  biasPercent = 100,
  currentBlockIndex = -1,
  elapsedInBlockSec = 0,
  liveRecords = [],
  height = 140,
  compact = false,
  onSelectBlock,
}) => {
  const totalDurationSec = Math.max(
    1,
    blocks.reduce((acc, b) => acc + Math.max(10, b.durationSec), 0)
  );

  // Determine max power on chart for vertical scaling
  let maxWattsOnChart = Math.round(profile.ftpWatts * 1.25);
  for (const b of blocks) {
    const sW =
      b.unit === 'pct_ftp' ? (b.startValue / 100) * profile.ftpWatts : b.startValue;
    const eW =
      b.unit === 'pct_ftp' ? (b.endValue / 100) * profile.ftpWatts : b.endValue;
    maxWattsOnChart = Math.max(
      maxWattsOnChart,
      Math.round(Math.max(sW, eW) * (biasPercent / 100) * 1.1)
    );
  }
  for (const rec of liveRecords) {
    if (rec.powerWatts > maxWattsOnChart) {
      maxWattsOnChart = Math.round(rec.powerWatts * 1.05);
    }
  }

  const viewWidth = 1000;
  const viewHeight = 220;
  const padTop = 26;
  const padBottom = 18;
  const usableHeight = viewHeight - padTop - padBottom;

  const wattsToY = (watts: number) => {
    const ratio = Math.min(1, Math.max(0, watts / maxWattsOnChart));
    return padTop + usableHeight * (1 - ratio);
  };

  const ftpY = wattsToY(profile.ftpWatts);

  // Build SVG polygons for each block (including curved ramps)
  let accSec = 0;
  const blockShapes = blocks.map((b, idx) => {
    const startSec = accSec;
    const dur = Math.max(10, b.durationSec);
    accSec += dur;

    const xStart = (startSec / totalDurationSec) * viewWidth;
    const xEnd = ((startSec + dur) / totalDurationSec) * viewWidth;
    const steps = b.type === 'ramp' || b.startValue !== b.endValue ? 14 : 2;

    const topPoints: string[] = [];
    let midWatts = 0;
    for (let s = 0; s <= steps; s++) {
      const t = (s / steps) * dur;
      const { targetWatts } = calculateBlockInstantTarget(
        b,
        t,
        profile.ftpWatts,
        biasPercent
      );
      if (s === Math.floor(steps / 2)) midWatts = targetWatts;
      const x = xStart + (s / steps) * (xEnd - xStart);
      const y = wattsToY(targetWatts);
      topPoints.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }

    const zone = getPowerZoneForWatts(midWatts, profile.ftpWatts, profile.powerZones);
    const baselineY = padTop + usableHeight;
    const polygonPoints = [
      `${xStart.toFixed(1)},${baselineY}`,
      ...topPoints,
      `${xEnd.toFixed(1)},${baselineY}`,
    ].join(' ');

    return {
      block: b,
      idx,
      xStart,
      xEnd,
      polygonPoints,
      color: zone.color,
      isCurrent: idx === currentBlockIndex,
      isPast: currentBlockIndex > idx,
    };
  });

  // Compute current elapsed time across entire workout for the arrow playhead
  let totalElapsedSec = 0;
  if (currentBlockIndex >= 0 && currentBlockIndex < blocks.length) {
    for (let i = 0; i < currentBlockIndex; i++) {
      totalElapsedSec += blocks[i].durationSec;
    }
    totalElapsedSec += Math.min(
      blocks[currentBlockIndex].durationSec,
      elapsedInBlockSec
    );
  }
  const playheadX = Math.min(
    viewWidth - 10,
    Math.max(10, (totalElapsedSec / totalDurationSec) * viewWidth)
  );

  // Build live power & HR polylines
  const powerTracePoints =
    liveRecords.length > 1
      ? liveRecords
          .filter((_, idx) => idx % Math.max(1, Math.floor(liveRecords.length / 250)) === 0)
          .map((r) => {
            const x = Math.min(
              viewWidth,
              (r.elapsedSec / totalDurationSec) * viewWidth
            );
            const y = wattsToY(r.powerWatts);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(' ')
      : '';

  const hrTracePoints =
    liveRecords.length > 1
      ? liveRecords
          .filter((_, idx) => idx % Math.max(1, Math.floor(liveRecords.length / 250)) === 0)
          .map((r) => {
            const x = Math.min(
              viewWidth,
              (r.elapsedSec / totalDurationSec) * viewWidth
            );
            const hrRatio = Math.min(1, Math.max(0, (r.heartRateBpm - 60) / 150));
            const y = padTop + usableHeight * (1 - hrRatio);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(' ')
      : '';

  return (
    <div className="relative w-full select-none rounded-xl bg-[#0B0F17] border border-slate-800 overflow-hidden">
      {/* Crisp HTML overlay labels (never stretched by SVG preserveAspectRatio="none") */}
      {!compact && (
        <div className="pointer-events-none absolute top-1.5 left-2 right-2 z-10 flex items-center justify-between gap-2 text-[10px] font-mono-tabular leading-none">
          <span className="px-1.5 py-0.5 rounded bg-[#0B0F17]/80 text-slate-400">
            Max {maxWattsOnChart}W
          </span>
          <span className="px-1.5 py-0.5 rounded bg-[#0B0F17]/80 text-amber-400 font-bold">
            FTP {profile.ftpWatts}W
          </span>
        </div>
      )}

      <svg
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        style={height ? { height: `${height}px` } : undefined}
        className="w-full block overflow-hidden"
        preserveAspectRatio="none"
      >
        {/* Horizontal grid lines */}
        {!compact &&
          [0.5, 1].map((ratio) => {
            const y = padTop + usableHeight * (1 - ratio);
            return (
              <line
                key={ratio}
                x1={0}
                y1={y}
                x2={viewWidth}
                y2={y}
                stroke="#1E293B"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
            );
          })}

        {/* Workout blocks & sloped ramps */}
        {blockShapes.map((shape) => (
          <g
            key={shape.block.id}
            onClick={() => onSelectBlock && onSelectBlock(shape.idx)}
            className={onSelectBlock ? 'cursor-pointer transition-opacity hover:opacity-95' : ''}
          >
            <polygon
              points={shape.polygonPoints}
              fill={shape.color}
              fillOpacity={shape.isCurrent ? 0.92 : shape.isPast ? 0.28 : 0.55}
              stroke={shape.isCurrent ? '#FFFFFF' : '#0B0F17'}
              strokeWidth={shape.isCurrent ? '2.5' : '1.5'}
            />
          </g>
        ))}

        {/* 100% FTP Reference Line */}
        <line
          x1={0}
          y1={ftpY}
          x2={viewWidth}
          y2={ftpY}
          stroke="#F59E0B"
          strokeWidth="1.5"
          strokeDasharray="6 4"
        />

        {/* Live Recorded Heart Rate Trace */}
        {hrTracePoints && (
          <polyline
            fill="none"
            stroke="#EF4444"
            strokeWidth="2"
            strokeOpacity="0.85"
            points={hrTracePoints}
          />
        )}

        {/* Live Recorded Power Trace */}
        {powerTracePoints && (
          <polyline
            fill="none"
            stroke="#F8FAFC"
            strokeWidth="2.5"
            points={powerTracePoints}
          />
        )}

        {/* GARMIN-STYLE PROMINENT ARROW POINTER (▼) SHOWING CURRENT POSITION IN WORKOUT */}
        {currentBlockIndex >= 0 && (
          <g>
            {/* Vertical cursor line */}
            <line
              x1={playheadX}
              y1={18}
              x2={playheadX}
              y2={padTop + usableHeight}
              stroke="#FFFFFF"
              strokeWidth="3"
            />
            {/* Top Downward Arrow Triangle (▼) */}
            <polygon
              points={`${playheadX - 11},2 ${playheadX + 11},2 ${playheadX},21`}
              fill="#10B981"
              stroke="#FFFFFF"
              strokeWidth="2"
            />
            {/* Bottom Upward Arrow Triangle (▲) */}
            <polygon
              points={`${playheadX - 9},${viewHeight - 2} ${playheadX + 9},${viewHeight - 2} ${playheadX},${padTop + usableHeight - 2}`}
              fill="#10B981"
              stroke="#FFFFFF"
              strokeWidth="1.5"
            />
          </g>
        )}
      </svg>
    </div>
  );
};
