import React, { useMemo } from 'react';
import { GpxPoint } from '../types/cycling';
import { ArrowUpRight, Mountain, Flag } from 'lucide-react';

interface ElevationProfileProps {
  points: GpxPoint[];
  currentDistanceKm: number;
  currentElevationM: number;
  currentSlopePct: number;
  remainingKm: number;
  totalDistanceKm: number;
  totalElevationGainM: number;
  className?: string;
}

export const ElevationProfile: React.FC<ElevationProfileProps> = ({
  points,
  currentDistanceKm,
  currentElevationM,
  currentSlopePct,
  remainingKm,
  totalDistanceKm,
  totalElevationGainM,
  className = '',
}) => {
  const width = 1000;
  const height = 140;
  const paddingBottom = 20;
  const paddingTop = 15;

  const { pathD, areaD, minEle, maxEle, currentRiderX, currentRiderY, segments } = useMemo(() => {
    if (!points || points.length === 0) {
      return {
        pathD: '',
        areaD: '',
        minEle: 0,
        maxEle: 100,
        currentRiderX: 0,
        currentRiderY: height - paddingBottom,
        segments: [],
      };
    }

    let minE = Infinity;
    let maxE = -Infinity;

    for (const p of points) {
      if (p.elevationM < minE) minE = p.elevationM;
      if (p.elevationM > maxE) maxE = p.elevationM;
    }

    // Ensure a reasonable vertical range
    const eleSpan = Math.max(20, maxE - minE);
    const usableHeight = height - paddingTop - paddingBottom;
    const maxDist = Math.max(0.1, totalDistanceKm);

    const getX = (dKm: number) => (dKm / maxDist) * width;
    const getY = (eleM: number) => height - paddingBottom - ((eleM - minE) / eleSpan) * usableHeight;

    // Subsample points for performance
    const step = Math.max(1, Math.floor(points.length / 400));
    const sampled = points.filter((_, idx) => idx % step === 0 || idx === points.length - 1);

    const coords = sampled.map((p) => ({
      x: getX(p.distanceKm),
      y: getY(p.elevationM),
      slope: p.slopePct,
      dist: p.distanceKm,
    }));

    // Top profile line
    const path = coords.reduce((acc, pt, idx) => {
      return idx === 0 ? `M ${pt.x.toFixed(1)},${pt.y.toFixed(1)}` : `${acc} L ${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
    }, '');

    // Area fill polygon
    const area = `${path} L ${width},${height - paddingBottom} L 0,${height - paddingBottom} Z`;

    // Rider current coordinates
    const clampedDist = Math.max(0, Math.min(maxDist, currentDistanceKm));
    const riderX = getX(clampedDist);
    const riderY = getY(currentElevationM);

    return {
      pathD: path,
      areaD: area,
      minEle: minE,
      maxEle: maxE,
      currentRiderX: riderX,
      currentRiderY: riderY,
      segments: coords,
    };
  }, [points, currentDistanceKm, currentElevationM, totalDistanceKm]);

  // Color helper for slope percentage
  const getSlopeColor = (slope: number) => {
    if (slope < 0) return 'text-emerald-400 border-emerald-500/50 bg-emerald-950/60';
    if (slope < 3) return 'text-blue-400 border-blue-500/50 bg-blue-950/60';
    if (slope < 6) return 'text-amber-400 border-amber-500/50 bg-amber-950/60';
    if (slope < 10) return 'text-orange-500 border-orange-500/60 bg-orange-950/70';
    return 'text-rose-500 border-rose-500/80 bg-rose-950/80 animate-pulse';
  };

  const getSlopeHex = (slope: number) => {
    if (slope < 0) return '#10b981';
    if (slope < 3) return '#38bdf8';
    if (slope < 6) return '#f59e0b';
    if (slope < 10) return '#f97316';
    return '#ef4444';
  };

  if (!points || points.length === 0) return null;

  return (
    <div
      className={`relative w-full rounded-2xl overflow-hidden backdrop-blur-md bg-black/70 border border-white/15 shadow-2xl p-3 ${className}`}
    >
      {/* Top Header stats */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10 text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-gray-300">
            <Mountain className="w-4 h-4 text-cyan-400" />
            <span className="font-semibold">{Math.round(currentElevationM)} m</span>
            <span className="text-gray-500 text-[10px]">({Math.round(minEle)}m - {Math.round(maxEle)}m)</span>
          </div>

          <div className="flex items-center gap-1 text-gray-400">
            <span className="text-[10px] uppercase font-bold tracking-wider">Desnivel:</span>
            <span className="font-mono text-white">+{totalElevationGainM} m</span>
          </div>
        </div>

        {/* Center: Current slope badge */}
        <div className="flex items-center gap-2">
          <div
            className={`px-2.5 py-1 rounded-full border text-xs font-black tracking-wide flex items-center gap-1 shadow-lg transition-colors ${getSlopeColor(
              currentSlopePct
            )}`}
          >
            <ArrowUpRight
              className="w-3.5 h-3.5"
              style={{
                transform: `rotate(${Math.max(-45, Math.min(45, -currentSlopePct * 4))}deg)`,
              }}
            />
            <span>{currentSlopePct > 0 ? `+${currentSlopePct.toFixed(1)}%` : `${currentSlopePct.toFixed(1)}%`}</span>
          </div>
        </div>

        {/* Right: Remaining distance */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-gray-300">
            <Flag className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-mono font-bold text-amber-300">{remainingKm.toFixed(1)} km</span>
            <span className="text-gray-500 text-[11px]">restantes</span>
          </div>
          <div className="text-[11px] font-mono text-gray-400">
            {((currentDistanceKm / Math.max(0.1, totalDistanceKm)) * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Elevation SVG Chart */}
      <div className="relative w-full h-24 pt-1">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="elevationAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
              <stop offset="70%" stopColor="#3b82f6" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
            </linearGradient>

            <linearGradient id="completedAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#d97706" stopOpacity="0.1" />
            </linearGradient>

            <clipPath id="completedClip">
              <rect x="0" y="0" width={currentRiderX} height={height} />
            </clipPath>
          </defs>

          {/* Grid lines */}
          <line
            x1="0"
            y1={height - paddingBottom}
            x2={width}
            y2={height - paddingBottom}
            stroke="rgba(255, 255, 255, 0.15)"
            strokeWidth="1"
          />

          {/* Main elevation area fill */}
          <path d={areaD} fill="url(#elevationAreaGradient)" />

          {/* Completed route area fill with orange highlight */}
          <path d={areaD} fill="url(#completedAreaGradient)" clipPath="url(#completedClip)" />

          {/* Top route profile line */}
          <path
            d={pathD}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Completed top line highlight */}
          <path
            d={pathD}
            fill="none"
            stroke="#facc15"
            strokeWidth="3.5"
            strokeLinecap="round"
            clipPath="url(#completedClip)"
          />

          {/* Vertical progress marker line */}
          <line
            x1={currentRiderX}
            y1={paddingTop}
            x2={currentRiderX}
            y2={height - paddingBottom}
            stroke="rgba(250, 204, 21, 0.6)"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />

          {/* Cyclist Position Marker */}
          <g transform={`translate(${currentRiderX}, ${currentRiderY})`}>
            {/* Glow ring */}
            <circle r="7" fill="none" stroke="#facc15" strokeWidth="2">
              <animate attributeName="r" values="5;10;5" dur="1.5s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="1;0.2;1" dur="1.5s" repeatCount="indefinite" />
            </circle>
            {/* Core dot */}
            <circle r="4" fill="#ffffff" stroke="#f59e0b" strokeWidth="2" />
          </g>
        </svg>

        {/* Distance markers along the bottom */}
        <div className="flex justify-between px-1 text-[9px] font-mono text-gray-500 pt-0.5">
          <span>0.0 km</span>
          <span>{(totalDistanceKm * 0.25).toFixed(1)} km</span>
          <span>{(totalDistanceKm * 0.5).toFixed(1)} km</span>
          <span>{(totalDistanceKm * 0.75).toFixed(1)} km</span>
          <span>{totalDistanceKm.toFixed(1)} km</span>
        </div>
      </div>
    </div>
  );
};
