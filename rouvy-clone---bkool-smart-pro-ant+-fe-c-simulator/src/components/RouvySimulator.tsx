import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  RouteData,
  RiderSettings,
  HardwareStatus,
  TelemetrySample,
  LiveTelemetry,
} from '../types/cycling';
import { CyclingPhysicsEngine } from '../utils/physicsEngine';
import { BkoolAntFeCController } from '../utils/antFeCWebUsb';
import { WebBluetoothHrController } from '../utils/webBluetoothHr';
import { interpolateRoutePoint } from '../utils/gpxParser';
import { MiniMap } from './MiniMap';
import { ElevationProfile } from './ElevationProfile';
import { TelemetryCharts } from './TelemetryCharts';
import {
  Zap,
  Heart,
  Activity,
  Gauge,
  ArrowUpRight,
  Play,
  Pause,
  RotateCcw,
  BarChart2,
  ChevronDown,
  ChevronUp,
  Settings,
  X,
  Volume2,
  VolumeX,
  Compass,
  Usb,
  Share2,
} from 'lucide-react';

interface RouvySimulatorProps {
  route: RouteData;
  videoUrl: string;
  riderSettings: RiderSettings;
  bkoolController: BkoolAntFeCController;
  hrController: WebBluetoothHrController;
  trainerStatus: HardwareStatus;
  hrStatus: HardwareStatus;
  onOpenHardwareModal: () => void;
  onOpenSyncModal: (data?: any) => void;
  onExitSession: () => void;
}

export const RouvySimulator: React.FC<RouvySimulatorProps> = ({
  route,
  videoUrl,
  riderSettings,
  bkoolController,
  hrController,
  trainerStatus,
  hrStatus,
  onOpenHardwareModal,
  onOpenSyncModal,
  onExitSession,
}) => {
  // Video element ref
  const videoRef = useRef<HTMLVideoElement>(null);

  // Physics engine instance
  const physicsRef = useRef<CyclingPhysicsEngine>(
    new CyclingPhysicsEngine({
      riderWeightKg: riderSettings.riderWeightKg,
      bikeWeightKg: riderSettings.bikeWeightKg,
      cda: riderSettings.cda,
      crr: riderSettings.crr,
    })
  );

  // Live state
  const [powerWatts, setPowerWatts] = useState<number>(trainerStatus === 'simulated' ? 180 : 0);
  const [cadenceRpm, setCadenceRpm] = useState<number>(0);
  const [speedKmh, setSpeedKmh] = useState<number>(0);
  const [heartRateBpm, setHeartRateBpm] = useState<number>(hrStatus === 'simulated' ? 135 : 0);
  const [currentDistanceKm, setCurrentDistanceKm] = useState<number>(0);
  const [currentSlopePct, setCurrentSlopePct] = useState<number>(0);
  const [currentElevationM, setCurrentElevationM] = useState<number>(
    route.points[0]?.elevationM || 0
  );
  const [currentLat, setCurrentLat] = useState<number>(route.points[0]?.lat || 0);
  const [currentLon, setCurrentLon] = useState<number>(route.points[0]?.lon || 0);

  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [showCharts, setShowCharts] = useState<boolean>(false);
  const [lastBkoolGradientSent, setLastBkoolGradientSent] = useState<number>(0);

  // Telemetry samples history for Recharts
  const [telemetrySamples, setTelemetrySamples] = useState<TelemetrySample[]>([]);

  // Format seconds to mm:ss or hh:mm:ss
  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Synchronize settings changes to physics engine
  useEffect(() => {
    physicsRef.current.updateSettings({
      riderWeightKg: riderSettings.riderWeightKg,
      bikeWeightKg: riderSettings.bikeWeightKg,
      cda: riderSettings.cda,
      crr: riderSettings.crr,
    });
  }, [riderSettings]);

  // Handle hardware data callbacks
  useEffect(() => {
    // Register live Bkool Trainer Data callbacks (WebUSB ANT+ FE-C)
    bkoolController.setCallbacks({
      onData: (watts, cad) => {
        setPowerWatts(watts);
        if (cad > 0) setCadenceRpm(cad);
      },
    });

    // Register BLE Heart Rate callback
    hrController.setCallbacks({
      onHeartRate: (bpm) => {
        if (bpm > 0) setHeartRateBpm(bpm);
      },
    });

    // If already simulated, initialize watts
    if (bkoolController.simulated) {
      setPowerWatts(bkoolController.getSimulatedWatts());
    }
  }, [bkoolController, hrController]);

  // Keyboard listener for pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPaused((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Main simulation tick loop (10 Hz = every 100ms)
  useEffect(() => {
    const dt = 0.1; // 100ms
    let sampleTimer = 0;

    const interval = setInterval(() => {
      if (isPaused) return;

      // 1. Calculate virtual speed via Physics Engine
      const effectiveWatts = powerWatts;
      const vSpeedKmh = physicsRef.current.updateVirtualSpeed(effectiveWatts, currentSlopePct, dt);
      setSpeedKmh(vSpeedKmh);

      // 2. Advance route distance
      // distance delta in km = (vSpeed in km/h) * (dt in hours)
      const distDeltaKm = vSpeedKmh * (dt / 3600.0);
      let newDistKm = currentDistanceKm + distDeltaKm;

      if (newDistKm >= route.totalDistanceKm) {
        newDistKm = route.totalDistanceKm;
      }
      setCurrentDistanceKm(newDistKm);

      // 3. Interpolate current point on GPX route
      const pt = interpolateRoutePoint(route.points, newDistKm);
      setCurrentSlopePct(pt.slopePct);
      setCurrentElevationM(pt.elevationM);
      setCurrentLat(pt.lat);
      setCurrentLon(pt.lon);

      // 4. Send target gradient to Bkool Smart Pro via ANT+ FE-C
      // To simulate road feeling and anticipate grade shifts like Rouvy, send target gradient
      bkoolController.sendTargetGradient(pt.slopePct);
      setLastBkoolGradientSent(pt.slopePct);

      // 5. Synchronize video playback rate
      if (videoRef.current) {
        if (effectiveWatts <= 0 && vSpeedKmh < 0.8) {
          if (!videoRef.current.paused) {
            videoRef.current.pause();
          }
        } else {
          if (videoRef.current.paused) {
            videoRef.current.play().catch(() => {});
          }
          // Compute playback rate proportional to reference recording speed (default 25 km/h)
          const refSpeed = Math.max(10, riderSettings.referenceSpeedKmh);
          const targetRate = Math.max(0.25, Math.min(2.8, vSpeedKmh / refSpeed));
          // Apply gentle rate smoothing to avoid audio pitch glitches
          const currentRate = videoRef.current.playbackRate;
          videoRef.current.playbackRate = currentRate + (targetRate - currentRate) * 0.2;
        }
      }

      // 6. Increment elapsed time and collect 1-second telemetry samples
      setElapsedSeconds((prev) => prev + dt);
      sampleTimer += dt;
      if (sampleTimer >= 1.0) {
        sampleTimer = 0;
        const currentSecs = Math.round(elapsedSeconds + 1);
        setTelemetrySamples((prev) => [
          ...prev,
          {
            timeSec: currentSecs,
            timeFormatted: formatTime(currentSecs),
            powerWatts: Math.round(effectiveWatts),
            heartRateBpm: Math.round(heartRateBpm),
            speedKmh: Math.round(vSpeedKmh * 10) / 10,
            cadenceRpm: Math.round(cadenceRpm),
            slopePct: pt.slopePct,
            distanceKm: Math.round(newDistKm * 100) / 100,
          },
        ]);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [
    isPaused,
    powerWatts,
    currentSlopePct,
    currentDistanceKm,
    route,
    riderSettings,
    bkoolController,
    heartRateBpm,
    cadenceRpm,
    elapsedSeconds,
  ]);

  // Color helper for power wattage zones
  const getPowerZoneColor = (w: number) => {
    const wKg = w / riderSettings.riderWeightKg;
    if (w < 120) return { bg: 'bg-slate-900/80', text: 'text-slate-300', border: 'border-slate-500/40' };
    if (w < 180) return { bg: 'bg-blue-950/80', text: 'text-blue-400', border: 'border-blue-500/50' };
    if (w < 250) return { bg: 'bg-emerald-950/80', text: 'text-emerald-400', border: 'border-emerald-500/50' };
    if (w < 320) return { bg: 'bg-amber-950/80', text: 'text-amber-400', border: 'border-amber-500/60' };
    if (w < 400) return { bg: 'bg-orange-950/80', text: 'text-orange-500', border: 'border-orange-500/70' };
    return { bg: 'bg-rose-950/90', text: 'text-rose-400', border: 'border-rose-500 animate-pulse' };
  };

  const powerZone = getPowerZoneColor(powerWatts);
  const wKg = (powerWatts / riderSettings.riderWeightKg).toFixed(1);

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden select-none font-sans">
      {/* 1. VIDEO PLAYER (Local MP4 via URL.createObjectURL or high-res procedural animated road) */}
      {videoUrl ? (
        <video
          ref={videoRef}
          src={videoUrl}
          autoPlay
          loop
          playsInline
          muted={isMuted}
          className="absolute inset-0 w-full h-full object-cover z-0"
        />
      ) : (
        /* Fallback Dynamic Visualizer when no MP4 was uploaded */
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-sky-900 via-neutral-900 to-black overflow-hidden flex items-center justify-center">
          {/* Panoramic Canyon / Mountain scenic backdrop */}
          <img
            src="/assets/aistudio/Gemini_Generated_Image_4ywzno4ywzno4ywz_429c982d.jpg"
            alt="Scenic Canyon Route"
            className="w-full h-full object-cover filter brightness-75 contrast-110"
            style={{
              transform: `scale(${1 + (speedKmh / 120)})`,
              transition: 'transform 0.5s ease-out',
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />

          {/* Road Perspective Grid Lines simulating movement */}
          <div className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none opacity-40">
            <div className="w-full h-full bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-amber-500/30 via-transparent to-transparent" />
          </div>
        </div>
      )}

      {/* 2. TOP HUD: ROUVY TELEMETRY BAR */}
      <div className="absolute top-4 left-4 right-4 z-20 flex items-start justify-between pointer-events-none">
        {/* Left: POWER BADGE (Iconic Rouvy Diamond/Hexagon Style) */}
        <div className="flex items-center gap-3 pointer-events-auto">
          <div
            className={`px-4 py-2.5 rounded-2xl border backdrop-blur-xl shadow-2xl flex items-center gap-3 transition-colors ${powerZone.bg} ${powerZone.border}`}
          >
            <div className="p-2 rounded-xl bg-yellow-400/20 text-yellow-400">
              <Zap className="w-6 h-6 fill-current animate-pulse" />
            </div>
            <div>
              <div className="flex items-baseline gap-1">
                <span className={`text-4xl font-black font-mono tracking-tight ${powerZone.text}`}>
                  {powerWatts}
                </span>
                <span className="text-xs font-bold text-gray-400">W</span>
              </div>
              <div className="text-[11px] font-bold text-gray-400 flex items-center gap-1.5">
                <span>{wKg} W/kg</span>
                <span className="text-white/30">•</span>
                <span className="text-cyan-400 uppercase tracking-wider text-[10px]">
                  Bkool Pro
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Center: CADENCE, SPEED, HR, DISTANCE & TIME */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Cadence */}
          <div className="px-3 py-2 rounded-xl backdrop-blur-xl bg-black/70 border border-white/15 flex items-center gap-2 text-center min-w-[75px]">
            <Activity className="w-4 h-4 text-cyan-400" />
            <div>
              <span className="text-xl font-black font-mono text-white leading-none block">
                {cadenceRpm}
              </span>
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">RPM</span>
            </div>
          </div>

          {/* Speed */}
          <div className="px-4 py-2 rounded-xl backdrop-blur-xl bg-black/75 border border-white/15 flex items-center gap-2 min-w-[100px]">
            <Gauge className="w-5 h-5 text-amber-400" />
            <div>
              <span className="text-2xl font-black font-mono text-white leading-none block">
                {speedKmh.toFixed(1)}
              </span>
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">KM/H</span>
            </div>
          </div>

          {/* Heart Rate */}
          <div className="px-3.5 py-2 rounded-xl backdrop-blur-xl bg-black/70 border border-white/15 flex items-center gap-2 text-center min-w-[85px]">
            <Heart className="w-4 h-4 text-rose-500 fill-current animate-pulse" />
            <div>
              <span className="text-xl font-black font-mono text-rose-400 leading-none block">
                {heartRateBpm > 0 ? heartRateBpm : '--'}
              </span>
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">BPM</span>
            </div>
          </div>

          {/* Distance & Elapsed Time Card */}
          <div className="px-4 py-2 rounded-xl backdrop-blur-xl bg-black/80 border border-white/15 flex flex-col justify-center text-right">
            <span className="text-base font-black font-mono text-white leading-tight">
              {currentDistanceKm.toFixed(2)}{' '}
              <span className="text-xs text-gray-400 font-normal">/ {route.totalDistanceKm} km</span>
            </span>
            <span className="text-xs font-mono font-bold text-amber-400">{formatTime(elapsedSeconds)}</span>
          </div>
        </div>

        {/* Right: FLOATING MINI-MAP OVERLAY & CONTROL BUTTONS */}
        <div className="flex items-start gap-2.5 pointer-events-auto">
          {/* Mini-map */}
          <MiniMap
            points={route.points}
            currentDistanceKm={currentDistanceKm}
            currentLat={currentLat}
            currentLon={currentLon}
          />

          {/* Controls Bar */}
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => setIsPaused(!isPaused)}
              className="p-2.5 rounded-xl backdrop-blur-xl bg-black/70 border border-white/20 text-white hover:bg-white/20 transition-all shadow-lg"
              title={isPaused ? 'Reanudar' : 'Pausar'}
            >
              {isPaused ? <Play className="w-4 h-4 fill-current text-emerald-400" /> : <Pause className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setShowCharts(!showCharts)}
              className={`p-2.5 rounded-xl backdrop-blur-xl border transition-all shadow-lg ${
                showCharts
                  ? 'bg-cyan-500 border-cyan-400 text-black'
                  : 'bg-black/70 border-white/20 text-white hover:bg-white/20'
              }`}
              title="Ver gráfico de Potencia & Pulso Recharts"
            >
              <BarChart2 className="w-4 h-4" />
            </button>

            {videoUrl && (
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-2.5 rounded-xl backdrop-blur-xl bg-black/70 border border-white/20 text-white hover:bg-white/20 transition-all shadow-lg"
                title={isMuted ? 'Activar sonido' : 'Silenciar'}
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-gray-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
              </button>
            )}

            <button
              onClick={() =>
                onOpenSyncModal({
                  samples: telemetrySamples,
                  elapsedSeconds,
                  powerWatts,
                  heartRateBpm,
                  speedKmh,
                  cadenceRpm,
                  currentDistanceKm,
                  currentElevationM,
                })
              }
              className="p-2.5 rounded-xl backdrop-blur-xl bg-gradient-to-r from-[#fc4c02]/85 to-amber-600/85 hover:from-[#fc4c02] hover:to-amber-600 border border-white/20 text-white transition-all shadow-lg shadow-orange-950/40 cursor-pointer"
              title="Guardar y sincronizar con Garmin & Strava"
            >
              <Share2 className="w-4 h-4" />
            </button>

            <button
              onClick={onOpenHardwareModal}
              className="p-2.5 rounded-xl backdrop-blur-xl bg-black/70 border border-white/20 text-white hover:bg-white/20 transition-all shadow-lg"
              title="Conexiones de hardware y ajustes"
            >
              <Settings className="w-4 h-4" />
            </button>

            <button
              onClick={onExitSession}
              className="p-2.5 rounded-xl backdrop-blur-xl bg-rose-950/80 border border-rose-500/40 text-rose-300 hover:bg-rose-900 transition-all shadow-lg"
              title="Finalizar sesión"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. CENTER OVERLAY: LIVE SLOPE & BKOOL FE-C RESISTANCE BADGE */}
      <div className="absolute right-6 top-56 z-20 flex flex-col items-end gap-2 pointer-events-none">
        <div className="backdrop-blur-xl bg-black/85 border-2 border-white/20 rounded-2xl p-3 shadow-2xl flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl shadow-lg ${
              currentSlopePct < 0
                ? 'bg-emerald-500 text-black shadow-emerald-500/40'
                : currentSlopePct < 4
                ? 'bg-cyan-400 text-black shadow-cyan-400/40'
                : currentSlopePct < 8
                ? 'bg-amber-400 text-black shadow-amber-400/40'
                : currentSlopePct < 12
                ? 'bg-orange-500 text-white shadow-orange-500/40'
                : 'bg-rose-600 text-white shadow-rose-600/50 animate-pulse'
            }`}
          >
            <ArrowUpRight
              className="w-7 h-7"
              style={{
                transform: `rotate(${Math.max(-45, Math.min(45, -currentSlopePct * 4))}deg)`,
              }}
            />
          </div>

          <div>
            <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400">
              Pendiente Ruta GPX
            </div>
            <div className="text-3xl font-black font-mono text-white leading-none">
              {currentSlopePct > 0 ? `+${currentSlopePct.toFixed(1)}%` : `${currentSlopePct.toFixed(1)}%`}
            </div>
            <div className="text-[10px] font-mono text-cyan-400 mt-0.5 flex items-center gap-1">
              <Usb className="w-3 h-3" />
              <span>Resistencia Automática: {lastBkoolGradientSent > 0 ? `+${lastBkoolGradientSent.toFixed(1)}%` : `${lastBkoolGradientSent.toFixed(1)}%`}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. RECHARTS OVERLAY PANEL (Collapsible) */}
      {showCharts && (
        <div className="absolute left-6 right-6 bottom-48 z-30 animate-fade-in pointer-events-auto max-w-4xl mx-auto">
          <div className="relative">
            <button
              onClick={() => setShowCharts(false)}
              className="absolute -top-3 right-3 p-1 rounded-full bg-neutral-800 border border-white/20 text-gray-400 hover:text-white z-40"
            >
              <X className="w-4 h-4" />
            </button>
            <TelemetryCharts
              samples={telemetrySamples}
              currentWatts={powerWatts}
              currentHr={heartRateBpm}
              currentCadence={cadenceRpm}
              currentSpeed={speedKmh}
            />
          </div>
        </div>
      )}

      {/* 5. BOTTOM BAR: ROUVY ALTITUDE PROFILE OVERLAY */}
      <div className="absolute bottom-4 left-4 right-4 z-20 pointer-events-auto max-w-6xl mx-auto">
        <ElevationProfile
          points={route.points}
          currentDistanceKm={currentDistanceKm}
          currentElevationM={currentElevationM}
          currentSlopePct={currentSlopePct}
          remainingKm={Math.max(0, route.totalDistanceKm - currentDistanceKm)}
          totalDistanceKm={route.totalDistanceKm}
          totalElevationGainM={route.totalElevationGainM}
        />
      </div>
    </div>
  );
};
