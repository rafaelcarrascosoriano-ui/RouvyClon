import React, { useState, useRef } from 'react';
import { RouteData, HardwareStatus } from '../types/cycling';
import { parseGpxXml } from '../utils/gpxParser';
import {
  Upload,
  Video,
  MapPin,
  Play,
  Usb,
  Heart,
  Settings,
  CheckCircle2,
  AlertCircle,
  FileText,
  Sparkles,
  Mountain,
  Compass,
  ArrowRight,
} from 'lucide-react';

// =========================================================================
// IMAGEN DE INICIO OFICIAL ROUVY (Solicitada por el usuario)
// Ubicación: public/assets/aistudio/Gemini_Generated_Image_4ywzno4ywzno4ywz_429c982d.jpg
// Línea de referencia: 21
// =========================================================================
export const WELCOME_IMAGE_PATH = '/assets/aistudio/Gemini_Generated_Image_4ywzno4ywzno4ywz_429c982d.jpg';

interface WelcomeScreenProps {
  onStartSession: (route: RouteData, videoUrl: string) => void;
  trainerStatus: HardwareStatus;
  hrStatus: HardwareStatus;
  onOpenHardwareModal: () => void;
  onOpenSyncModal: () => void;
  onConnectTrainer: () => void;
  onConnectHr: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onStartSession,
  trainerStatus,
  hrStatus,
  onOpenHardwareModal,
  onOpenSyncModal,
  onConnectTrainer,
  onConnectHr,
}) => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [gpxFile, setGpxFile] = useState<File | null>(null);
  const [parsedRoute, setParsedRoute] = useState<RouteData | null>(null);
  const [isLoadingGpx, setIsLoadingGpx] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const videoInputRef = useRef<HTMLInputElement>(null);
  const gpxInputRef = useRef<HTMLInputElement>(null);

  // Preset demo routes loaded from /public/routes/
  const presetRoutes = [
    {
      id: 'alpe-dhuez',
      name: "Alpe d'Huez (21 Virajes)",
      gpxPath: '/routes/alpe_d_huez__21_virajes_.gpx',
      distanceKm: 13.8,
      ascentM: 1090,
      maxSlope: 12.8,
      desc: 'La mítica subida a la estación francesa con sus 21 curvas de herradura.',
    },
    {
      id: 'sa-calobra',
      name: 'Sa Calobra (Coll dels Reis)',
      gpxPath: '/routes/sa_calobra__coll_dels_reis_.gpx',
      distanceKm: 9.9,
      ascentM: 680,
      maxSlope: 11.2,
      desc: 'El coloso mallorquín con vistas al mar Mediterráneo y curvas serpenteantes.',
    },
    {
      id: 'costa-brava',
      name: 'Costa Brava Rolling Sprint',
      gpxPath: '/routes/costa_brava_rolling_sprint.gpx',
      distanceKm: 18.5,
      ascentM: 320,
      maxSlope: 6.5,
      desc: 'Ruta rompepiernas con vistas a acantilados, ideal para cambios de ritmo.',
    },
  ];

  // Handle local MP4 video file selection
  const handleVideoSelect = (file: File) => {
    if (!file.type.includes('video') && !file.name.endsWith('.mp4')) {
      setErrorMessage('Por favor, selecciona un archivo de video en formato MP4.');
      return;
    }
    setErrorMessage(null);
    setVideoFile(file);
    // Create local object URL for in-memory, zero-server playback
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
  };

  // Handle local GPX file selection
  const handleGpxSelect = (file: File) => {
    if (!file.name.endsWith('.gpx') && !file.type.includes('xml')) {
      setErrorMessage('Por favor, selecciona un archivo de ruta válido con extensión .gpx.');
      return;
    }
    setErrorMessage(null);
    setGpxFile(file);
    setIsLoadingGpx(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const route = parseGpxXml(text, file.name.replace('.gpx', ''));
        route.gpxFileName = file.name;
        setParsedRoute(route);
        setIsLoadingGpx(false);
      } catch (err: any) {
        setErrorMessage(err.message || 'Error al procesar el archivo GPX en memoria.');
        setIsLoadingGpx(false);
      }
    };
    reader.onerror = () => {
      setErrorMessage('Error al leer el archivo GPX desde el disco local.');
      setIsLoadingGpx(false);
    };
    reader.readAsText(file);
  };

  // Load a preset GPX
  const handleLoadPresetRoute = async (preset: (typeof presetRoutes)[0]) => {
    try {
      setIsLoadingGpx(true);
      setErrorMessage(null);
      const res = await fetch(preset.gpxPath);
      if (!res.ok) throw new Error(`No se pudo cargar ${preset.name}`);
      const text = await res.text();
      const route = parseGpxXml(text, preset.name);
      route.gpxFileName = preset.name;
      setParsedRoute(route);
      setGpxFile(null);
      setIsLoadingGpx(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error cargando ruta predeterminada.');
      setIsLoadingGpx(false);
    }
  };

  const handleStart = () => {
    if (!parsedRoute) {
      setErrorMessage('Debes cargar un archivo de ruta GPX o seleccionar una ruta predeterminada.');
      return;
    }

    // If user didn't load an MP4, offer fallback demo canvas or let them continue
    const effectiveVideoUrl = videoUrl || '';
    onStartSession(parsedRoute, effectiveVideoUrl);
  };

  const statusBadge = (status: HardwareStatus) => {
    switch (status) {
      case 'connected':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" /> Conectado
          </span>
        );
      case 'simulated':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
            Simulador Activo
          </span>
        );
      case 'connecting':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse">
            Conectando...
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-gray-500/20 text-gray-400 border border-gray-500/30">
            Desconectado
          </span>
        );
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-neutral-950 text-white overflow-x-hidden flex flex-col justify-between">
      {/* Background Image Banner with Dark Cinematic Overlay */}
      <div className="absolute inset-0 z-0">
        <img
          src={WELCOME_IMAGE_PATH}
          alt="Rouvy Cycling Wallpaper"
          className="w-full h-full object-cover object-center filter brightness-50 contrast-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/75 to-neutral-900/60" />
      </div>

      {/* Top Navbar */}
      <header className="relative z-10 w-full px-6 py-4 flex items-center justify-between border-b border-white/10 backdrop-blur-md bg-black/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-500 flex items-center justify-center font-black text-xl italic shadow-lg shadow-rose-900/40">
            R
          </div>
          <div>
            <h1 className="text-xl font-black tracking-wider text-white uppercase flex items-center gap-2">
              ROUVY <span className="text-cyan-400 text-xs font-bold px-2 py-0.5 rounded-full bg-cyan-950/70 border border-cyan-500/30">Bkool Smart Pro</span>
            </h1>
            <p className="text-[11px] text-gray-400">Simulador de Ciclismo Virtual • WebUSB ANT+ FE-C</p>
          </div>
        </div>

        {/* Hardware Status & Config Button */}
        <div className="flex items-center gap-3">
          {/* 1. Conectar Rodillo ANT+ (WebUSB) */}
          <button
            onClick={onConnectTrainer}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-md cursor-pointer ${
              trainerStatus === 'connected'
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400'
                : 'bg-cyan-950/40 hover:bg-cyan-900/60 border-cyan-500/40 text-cyan-300'
            }`}
            title="Abre el selector WebUSB para el pincho ANT+"
          >
            <Usb className="w-4 h-4 text-cyan-400" />
            <span>
              {trainerStatus === 'connected'
                ? 'Rodillo ANT+: Conectado'
                : 'Conectar Rodillo ANT+ (WebUSB)'}
            </span>
            <span
              className={`w-2 h-2 rounded-full ${
                trainerStatus === 'connected'
                  ? 'bg-emerald-400'
                  : trainerStatus === 'connecting'
                  ? 'bg-amber-400 animate-ping'
                  : 'bg-gray-500'
              }`}
            />
          </button>

          {/* 2. Conectar Pulsómetro (Bluetooth) */}
          <button
            onClick={onConnectHr}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-md cursor-pointer ${
              hrStatus === 'connected'
                ? 'bg-rose-950/60 border-rose-500/40 text-rose-400'
                : 'bg-rose-950/30 hover:bg-rose-900/50 border-rose-500/40 text-rose-300'
            }`}
            title="Abre la ventana de emparejamiento Bluetooth para la banda de pulso"
          >
            <Heart className="w-4 h-4 text-rose-500 fill-current" />
            <span>
              {hrStatus === 'connected'
                ? 'Pulsómetro: Conectado'
                : 'Conectar Pulsómetro (Bluetooth)'}
            </span>
            <span
              className={`w-2 h-2 rounded-full ${
                hrStatus === 'connected'
                  ? 'bg-rose-400 animate-pulse'
                  : hrStatus === 'connecting'
                  ? 'bg-amber-400 animate-ping'
                  : 'bg-gray-500'
              }`}
            />
          </button>

          {/* Garmin & Strava button */}
          <button
            onClick={onOpenSyncModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#fc4c02]/80 to-amber-600/80 hover:from-[#fc4c02] hover:to-amber-600 border border-white/20 text-xs font-bold text-white shadow-lg shadow-orange-950/40 transition-all cursor-pointer"
            title="Conectar y sincronizar con Garmin y Strava"
          >
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span>Garmin & Strava</span>
          </button>

          {/* Settings modal button */}
          <button
            onClick={onOpenHardwareModal}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-gray-300 hover:text-white transition-colors"
            title="Ajustes de hardware y física"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 max-w-6xl w-full mx-auto px-4 py-8 flex-1 flex flex-col justify-center">
        {/* Hero Title & Description */}
        <div className="text-center max-w-2xl mx-auto mb-8 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-bold uppercase tracking-wider mb-2">
            <Sparkles className="w-3.5 h-3.5" /> 100% Procesamiento Local en Memoria (Sin Servidores)
          </div>
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white">
            Tu Carretera Favorita, <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-yellow-300 to-rose-500">en tu Bkool Pro</span>
          </h2>
          <p className="text-sm sm:text-base text-gray-300">
            Carga tu video MP4 y archivo GPX localmente. El protocolo ANT+ FE-C adaptará la resistencia del rodillo paso a paso según la pendiente real.
          </p>
        </div>

        {/* Error message alert */}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-3 shadow-xl">
            <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
            <span className="flex-1">{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-white font-bold">
              ✕
            </button>
          </div>
        )}

        {/* Separación de Canales de Hardware: Rodillo WebUSB vs Pulsómetro Bluetooth */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {/* Card 1: Rodillo Bkool Smart Pro (WebUSB ANT+) */}
          <div className="p-4 rounded-2xl bg-black/60 border border-cyan-500/30 backdrop-blur-xl flex flex-col justify-between gap-3 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400">
                  <Usb className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Rodillo Bkool Smart Pro</h3>
                  <p className="text-[11px] text-gray-400">Canal exclusivo WebUSB • Pincho ANT+ FE-C</p>
                </div>
              </div>
              <div>{statusBadge(trainerStatus)}</div>
            </div>

            <button
              onClick={onConnectTrainer}
              className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg ${
                trainerStatus === 'connected'
                  ? 'bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-rose-300'
                  : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-cyan-950/50'
              }`}
            >
              <Usb className="w-4 h-4" />
              <span>
                {trainerStatus === 'connected'
                  ? 'Desconectar Rodillo'
                  : 'Conectar Rodillo ANT+ (WebUSB)'}
              </span>
            </button>
          </div>

          {/* Card 2: Pulsómetro (Web Bluetooth) */}
          <div className="p-4 rounded-2xl bg-black/60 border border-rose-500/30 backdrop-blur-xl flex flex-col justify-between gap-3 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400">
                  <Heart className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Banda de Pulso Cardíaco</h3>
                  <p className="text-[11px] text-gray-400">Canal Bluetooth integrado (Web Bluetooth 0x180D)</p>
                </div>
              </div>
              <div>{statusBadge(hrStatus)}</div>
            </div>

            <button
              onClick={onConnectHr}
              className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg ${
                hrStatus === 'connected'
                  ? 'bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-rose-300'
                  : 'bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white shadow-rose-950/50'
              }`}
            >
              <Heart className="w-4 h-4 fill-current" />
              <span>
                {hrStatus === 'connected'
                  ? 'Desconectar Pulsómetro'
                  : 'Conectar Pulsómetro (Bluetooth)'}
              </span>
            </button>
          </div>
        </div>

        {/* 2-Column Local File Dropzone & Selection Panel */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Card 1: Local MP4 Video Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleVideoSelect(e.dataTransfer.files[0]);
              }
            }}
            onClick={() => videoInputRef.current?.click()}
            className={`group relative p-6 rounded-2xl border-2 border-dashed transition-all cursor-pointer backdrop-blur-xl flex flex-col items-center justify-center text-center gap-4 min-h-[220px] ${
              videoFile
                ? 'bg-cyan-950/30 border-cyan-400/60 shadow-lg shadow-cyan-950/50'
                : 'bg-black/50 border-white/20 hover:border-cyan-400/50 hover:bg-black/60'
            }`}
          >
            <input
              type="file"
              ref={videoInputRef}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleVideoSelect(e.target.files[0]);
                }
              }}
              accept="video/mp4,video/*"
              className="hidden"
            />

            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 ${
                videoFile ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/40' : 'bg-white/10 text-cyan-400'
              }`}
            >
              <Video className="w-7 h-7" />
            </div>

            <div>
              <h3 className="font-bold text-base text-white mb-1">
                {videoFile ? videoFile.name : '1. Archivo de Video MP4 de la Ruta'}
              </h3>
              <p className="text-xs text-gray-400 max-w-xs">
                {videoFile
                  ? `Cargado localmente (${(videoFile.size / (1024 * 1024)).toFixed(1)} MB) • URL en memoria activa`
                  : 'Arrastra y suelta tu video MP4 aquí o haz clic para explorar tu disco duro.'}
              </p>
            </div>

            {videoFile ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-400/20 text-cyan-300 text-xs font-bold border border-cyan-400/30">
                <CheckCircle2 className="w-3.5 h-3.5" /> Video Listo para Sincronizar
              </span>
            ) : (
              <span className="text-[11px] text-gray-500 flex items-center gap-1">
                <Upload className="w-3.5 h-3.5" /> Clic para seleccionar desde disco local
              </span>
            )}
          </div>

          {/* Card 2: Local GPX Route Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleGpxSelect(e.dataTransfer.files[0]);
              }
            }}
            onClick={() => gpxInputRef.current?.click()}
            className={`group relative p-6 rounded-2xl border-2 border-dashed transition-all cursor-pointer backdrop-blur-xl flex flex-col items-center justify-center text-center gap-4 min-h-[220px] ${
              parsedRoute
                ? 'bg-amber-950/30 border-amber-400/60 shadow-lg shadow-amber-950/50'
                : 'bg-black/50 border-white/20 hover:border-amber-400/50 hover:bg-black/60'
            }`}
          >
            <input
              type="file"
              ref={gpxInputRef}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleGpxSelect(e.target.files[0]);
                }
              }}
              accept=".gpx,application/xml,text/xml"
              className="hidden"
            />

            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 ${
                parsedRoute ? 'bg-amber-400 text-black shadow-lg shadow-amber-400/40' : 'bg-white/10 text-amber-400'
              }`}
            >
              <MapPin className="w-7 h-7" />
            </div>

            <div>
              <h3 className="font-bold text-base text-white mb-1">
                {parsedRoute ? parsedRoute.name : '2. Archivo de Ruta GPX'}
              </h3>
              <p className="text-xs text-gray-400 max-w-xs">
                {parsedRoute
                  ? `${parsedRoute.totalDistanceKm} km • +${parsedRoute.totalElevationGainM}m desnivel • Max ${parsedRoute.maxSlopePct}%`
                  : 'Arrastra y suelta tu archivo .gpx para procesar distancias y pendientes en memoria.'}
              </p>
            </div>

            {parsedRoute ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 text-amber-300 text-xs font-bold border border-amber-400/30">
                <CheckCircle2 className="w-3.5 h-3.5" /> GPX Analizado ({parsedRoute.points.length} puntos)
              </span>
            ) : (
              <span className="text-[11px] text-gray-500 flex items-center gap-1">
                <Upload className="w-3.5 h-3.5" /> Clic para seleccionar desde disco local
              </span>
            )}
          </div>
        </div>

        {/* Preset Routes Selector */}
        <div className="p-5 rounded-2xl bg-black/60 border border-white/10 backdrop-blur-xl mb-8">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
              <Mountain className="w-4 h-4 text-cyan-400" /> O selecciona una ruta predeterminada de prueba:
            </span>
            <span className="text-[11px] text-gray-500">Incluidas en la app</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {presetRoutes.map((preset) => {
              const isSelected = parsedRoute?.name === preset.name;
              return (
                <button
                  key={preset.id}
                  onClick={() => handleLoadPresetRoute(preset)}
                  className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between gap-2 ${
                    isSelected
                      ? 'bg-cyan-950/40 border-cyan-400 text-white shadow-lg shadow-cyan-950/40'
                      : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:border-white/20'
                  }`}
                >
                  <div>
                    <div className="font-bold text-sm text-white flex items-center justify-between">
                      <span>{preset.name}</span>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-cyan-400" />}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1 line-clamp-2">{preset.desc}</p>
                  </div>

                  <div className="flex items-center gap-3 text-[10px] font-mono text-gray-400 border-t border-white/10 pt-2">
                    <span className="text-cyan-400 font-bold">{preset.distanceKm} km</span>
                    <span className="text-amber-400 font-bold">+{preset.ascentM} m</span>
                    <span className="text-rose-400 font-bold">Max {preset.maxSlope}%</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Start Training Session Button */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={handleStart}
            disabled={!parsedRoute}
            className={`w-full sm:w-auto min-w-[280px] px-8 py-4 rounded-2xl font-black text-base uppercase tracking-wider transition-all shadow-2xl flex items-center justify-center gap-3 ${
              parsedRoute
                ? 'bg-gradient-to-r from-rose-600 via-amber-500 to-cyan-400 text-black hover:opacity-95 shadow-amber-500/25 hover:scale-[1.02] cursor-pointer'
                : 'bg-white/10 text-gray-500 border border-white/10 cursor-not-allowed'
            }`}
          >
            <Play className="w-5 h-5 fill-current" />
            <span>Iniciar Sesión en Rodillo</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>

        {/* Bottom Helpful Hardware Note */}
        <div className="mt-8 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
          <Usb className="w-4 h-4 text-cyan-400" />
          <span>
            Bkool Smart Pro: Conecta tu pincho USB ANT+ para control de pendiente automático mediante WebUSB FE-C.
          </span>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full py-4 text-center text-[11px] text-gray-500 border-t border-white/10 backdrop-blur-md bg-black/40">
        Rouvy Clone Simulator • React + Tailwind CSS + WebUSB ANT+ FE-C • Desplegable en Vercel
      </footer>
    </div>
  );
};
