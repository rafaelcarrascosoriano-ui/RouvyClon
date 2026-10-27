import React, { useMemo } from 'react';
import { GpxPoint } from '../types/cycling';
import { Compass, Maximize2, Minimize2 } from 'lucide-react';

interface MiniMapProps {
  points: GpxPoint[];
  currentDistanceKm: number;
  currentLat?: number;
  currentLon?: number;
  className?: string;
}

export const MiniMap: React.FC<MiniMapProps> = ({
  points,
  currentDistanceKm,
  currentLat,
  currentLon,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = React.useState(false);

  // Calculate bounding box and SVG path coordinates
  const { pathString, riderPos, minLat, maxLat, minLon, maxLon } = useMemo(() => {
    if (!points || points.length === 0) {
      return { pathString: '', riderPos: null, minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 };
    }

    let minLt = Infinity;
    let maxLt = -Infinity;
    let minLn = Infinity;
    let maxLn = -Infinity;

    for (const p of points) {
      if (p.lat < minLt) minLt = p.lat;
      if (p.lat > maxLt) maxLt = p.lat;
      if (p.lon < minLn) minLn = p.lon;
      if (p.lon > maxLn) maxLn = p.lon;
    }

    // Add 10% padding
    const latSpan = Math.max(0.001, maxLt - minLt);
    const lonSpan = Math.max(0.001, maxLn - minLn);

    const padLat = latSpan * 0.1;
    const padLon = lonSpan * 0.1;

    const bMinLat = minLt - padLat;
    const bMaxLat = maxLt + padLat;
    const bMinLon = minLn - padLon;
    const bMaxLon = maxLn + padLon;

    const width = 300;
    const height = 220;

    // Mercator-like projection into SVG canvas
    const project = (lat: number, lon: number) => {
      const x = ((lon - bMinLon) / (bMaxLon - bMinLon)) * width;
      // Invert Y for SVG coordinates
      const y = height - ((lat - bMinLat) / (bMaxLat - bMinLat)) * height;
      return { x, y };
    };

    // Subsample points if route has thousands of points for smooth 60fps rendering
    const step = Math.max(1, Math.floor(points.length / 300));
    const sampled = points.filter((_, idx) => idx % step === 0 || idx === points.length - 1);

    const svgCoords = sampled.map((p) => project(p.lat, p.lon));
    const path = svgCoords.reduce((acc, pt, idx) => {
      return idx === 0 ? `M ${pt.x.toFixed(1)},${pt.y.toFixed(1)}` : `${acc} L ${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
    }, '');

    // Current rider position
    let rider: { x: number; y: number } | null = null;
    if (currentLat !== undefined && currentLon !== undefined) {
      rider = project(currentLat, currentLon);
    } else {
      // Find point closest to currentDistanceKm
      const closest = points.reduce((prev, curr) =>
        Math.abs(curr.distanceKm - currentDistanceKm) < Math.abs(prev.distanceKm - currentDistanceKm) ? curr : prev
      );
      rider = project(closest.lat, closest.lon);
    }

    return {
      pathString: path,
      riderPos: rider,
      minLat: minLt,
      maxLat: maxLt,
      minLon: minLn,
      maxLon: maxLn,
    };
  }, [points, currentDistanceKm, currentLat, currentLon]);

  if (!points || points.length === 0) return null;

  return (
    <div
      className={`relative rounded-xl overflow-hidden backdrop-blur-md bg-black/60 border border-white/20 shadow-2xl transition-all duration-300 ${
        isExpanded ? 'w-80 h-72' : 'w-56 h-48'
      } ${className}`}
    >
      {/* Header bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 py-1.5 bg-black/40 border-b border-white/10 text-xs">
        <span className="flex items-center gap-1.5 font-bold tracking-wider text-cyan-400 uppercase text-[10px]">
          <Compass className="w-3.5 h-3.5 text-cyan-400 animate-spin-slow" /> Mini-Mapa GPS
        </span>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-gray-400 hover:text-white transition-colors p-0.5 rounded"
          title={isExpanded ? 'Reducir' : 'Ampliar'}
        >
          {isExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
        </button>
      </div>

      {/* SVG Canvas */}
      <svg
        viewBox="0 0 300 220"
        className="w-full h-full pt-6 p-2"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Outer subtle route path glow */}
        <path
          d={pathString}
          fill="none"
          stroke="rgba(56, 189, 248, 0.3)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Main route track line */}
        <path
          d={pathString}
          fill="none"
          stroke="url(#routeGradient)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Start Point */}
        {points.length > 0 && (
          <circle
            cx={points[0] ? (pathString.split(' ')[1] ? parseFloat(pathString.split(' ')[1].split(',')[0]) : 0) : 0}
            cy={points[0] ? (pathString.split(' ')[1] ? parseFloat(pathString.split(' ')[1].split(',')[1]) : 0) : 0}
            r="4"
            fill="#10b981"
            stroke="#ffffff"
            strokeWidth="1.5"
          />
        )}

        {/* Real-time Cyclist Marker */}
        {riderPos && (
          <g transform={`translate(${riderPos.x}, ${riderPos.y})`}>
            {/* Animated pulse ring */}
            <circle r="9" fill="none" stroke="#38bdf8" strokeWidth="2" opacity="0.8">
              <animate attributeName="r" values="5;14;5" dur="1.8s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.9;0.1;0.9" dur="1.8s" repeatCount="indefinite" />
            </circle>

            {/* Rider solid core */}
            <circle r="5" fill="#facc15" stroke="#ffffff" strokeWidth="2" filter="url(#glow)" />
          </g>
        )}
      </svg>

      {/* Footer distance overlay */}
      <div className="absolute bottom-1 right-2 text-[10px] font-mono text-gray-300 bg-black/60 px-1.5 py-0.5 rounded border border-white/10">
        {currentDistanceKm.toFixed(2)} km
      </div>
    </div>
  );
};
