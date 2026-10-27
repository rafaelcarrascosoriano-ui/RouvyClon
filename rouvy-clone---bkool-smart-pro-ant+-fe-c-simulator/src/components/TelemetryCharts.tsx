import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { TelemetrySample } from '../types/cycling';
import { Zap, Heart, Activity, Flame, Trophy } from 'lucide-react';

interface TelemetryChartsProps {
  samples: TelemetrySample[];
  currentWatts: number;
  currentHr: number;
  currentCadence: number;
  currentSpeed: number;
  className?: string;
}

export const TelemetryCharts: React.FC<TelemetryChartsProps> = ({
  samples,
  currentWatts,
  currentHr,
  currentCadence,
  currentSpeed,
  className = '',
}) => {
  // Compute summary stats
  const stats = useMemo(() => {
    if (!samples || samples.length === 0) {
      return {
        avgWatts: currentWatts,
        maxWatts: currentWatts,
        avgHr: currentHr,
        maxHr: currentHr,
        totalWorkKj: 0,
        estimatedCalories: 0,
      };
    }

    let sumWatts = 0;
    let maxWatts = 0;
    let sumHr = 0;
    let countHr = 0;
    let maxHr = 0;

    for (const s of samples) {
      sumWatts += s.powerWatts;
      if (s.powerWatts > maxWatts) maxWatts = s.powerWatts;

      if (s.heartRateBpm > 0) {
        sumHr += s.heartRateBpm;
        countHr++;
        if (s.heartRateBpm > maxHr) maxHr = s.heartRateBpm;
      }
    }

    const avgWatts = Math.round(sumWatts / samples.length);
    const avgHr = countHr > 0 ? Math.round(sumHr / countHr) : currentHr;
    // Total Work in kJ = sum(watts * 1s) / 1000
    const totalWorkKj = Math.round((sumWatts * 1) / 1000);
    // 1 kJ external mechanical work ≈ 1 kcal burned by human body (approx 24% human gross efficiency)
    const estimatedCalories = Math.round(totalWorkKj * 1.05);

    return {
      avgWatts,
      maxWatts,
      avgHr,
      maxHr,
      totalWorkKj,
      estimatedCalories,
    };
  }, [samples, currentWatts, currentHr]);

  // Downsample chart data to maintain silky smooth UI if many samples
  const chartData = useMemo(() => {
    if (!samples || samples.length <= 120) return samples;
    const factor = Math.ceil(samples.length / 120);
    return samples.filter((_, idx) => idx % factor === 0 || idx === samples.length - 1);
  }, [samples]);

  return (
    <div
      className={`rounded-2xl backdrop-blur-xl bg-black/80 border border-white/15 p-4 text-white shadow-2xl ${className}`}
    >
      {/* Top summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {/* Potencia Promedio / Max */}
        <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-yellow-400" /> Potencia
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-black font-mono text-yellow-400">{stats.avgWatts}</span>
              <span className="text-[10px] text-gray-400">W med</span>
            </div>
            <div className="text-[10px] text-gray-500 font-mono">Max: {stats.maxWatts} W</div>
          </div>
          <div className="text-right">
            <span className="text-xs font-mono font-bold text-yellow-300/80">{currentWatts} W</span>
            <span className="block text-[9px] text-gray-500">actual</span>
          </div>
        </div>

        {/* Frecuencia Cardíaca */}
        <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <Heart className="w-3.5 h-3.5 text-rose-500 animate-pulse" /> Pulso
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-black font-mono text-rose-400">{stats.avgHr || '--'}</span>
              <span className="text-[10px] text-gray-400">BPM med</span>
            </div>
            <div className="text-[10px] text-gray-500 font-mono">Max: {stats.maxHr || '--'} BPM</div>
          </div>
          <div className="text-right">
            <span className="text-xs font-mono font-bold text-rose-300">{currentHr > 0 ? currentHr : '--'}</span>
            <span className="block text-[9px] text-gray-500">actual</span>
          </div>
        </div>

        {/* Cadencia y Velocidad */}
        <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-cyan-400" /> Cadencia & Vel
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-black font-mono text-cyan-400">{currentCadence}</span>
              <span className="text-[10px] text-gray-400">RPM</span>
            </div>
            <div className="text-[10px] text-gray-400 font-mono">{currentSpeed.toFixed(1)} km/h</div>
          </div>
        </div>

        {/* Trabajo y Calorías */}
        <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-orange-400" /> Energía
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-xl font-black font-mono text-orange-400">{stats.estimatedCalories}</span>
              <span className="text-[10px] text-gray-400">kcal</span>
            </div>
            <div className="text-[10px] text-gray-500 font-mono">{stats.totalWorkKj} kJ mecánico</div>
          </div>
          <Trophy className="w-5 h-5 text-amber-500/50" />
        </div>
      </div>

      {/* Main Recharts superimposing Power & Heart Rate */}
      <div className="w-full h-52 pt-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.08)" vertical={false} />
            <XAxis
              dataKey="timeFormatted"
              stroke="#64748b"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(255, 255, 255, 0.1)' }}
            />

            {/* Left Y-Axis: Power (W) */}
            <YAxis
              yAxisId="power"
              orientation="left"
              stroke="#eab308"
              domain={[0, (dataMax: number) => Math.max(300, Math.ceil(dataMax * 1.15))]}
              tick={{ fontSize: 10, fill: '#facc15' }}
              tickLine={false}
              axisLine={false}
              unit="W"
            />

            {/* Right Y-Axis: Heart Rate (BPM) */}
            <YAxis
              yAxisId="hr"
              orientation="right"
              stroke="#f43f5e"
              domain={[60, 200]}
              tick={{ fontSize: 10, fill: '#fb7185' }}
              tickLine={false}
              axisLine={false}
              unit="bpm"
            />

            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '0.75rem',
                fontSize: '11px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
              }}
              labelStyle={{ color: '#94a3b8', fontWeight: 'bold' }}
              itemStyle={{ padding: '2px 0' }}
            />

            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              wrapperStyle={{ fontSize: '11px', paddingBottom: '6px' }}
            />

            {/* Power Line (Watts) */}
            <Line
              yAxisId="power"
              type="monotone"
              dataKey="powerWatts"
              name="Potencia (Watts)"
              stroke="#facc15"
              strokeWidth={2.2}
              dot={false}
              isAnimationActive={false}
            />

            {/* Heart Rate Line (BPM) */}
            <Line
              yAxisId="hr"
              type="monotone"
              dataKey="heartRateBpm"
              name="Pulso (BPM)"
              stroke="#f43f5e"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
