import React, { useState, useEffect } from 'react';
import {
  UploadCloud,
  CheckCircle2,
  ExternalLink,
  Download,
  AlertCircle,
  X,
  Share2,
  Lock,
  Copy,
  Check,
  RefreshCw,
  HelpCircle,
} from 'lucide-react';
import { RouteData, TelemetrySample } from '../types/cycling';
import {
  generateTcx,
  generateGpx,
  downloadFile,
  openGarminConnectImport,
  ActivitySummary,
} from '../utils/activityExporter';

interface SyncServicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  route?: RouteData | null;
  samples?: TelemetrySample[];
  elapsedSeconds?: number;
  avgWatts?: number;
  maxWatts?: number;
  avgHr?: number;
  maxHr?: number;
  avgCadence?: number;
  speedKmh?: number;
  distanceKm?: number;
  elevationGainM?: number;
}

export const SyncServicesModal: React.FC<SyncServicesModalProps> = ({
  isOpen,
  onClose,
  route,
  samples = [],
  elapsedSeconds = 1800,
  avgWatts = 190,
  maxWatts = 340,
  avgHr = 142,
  maxHr = 168,
  avgCadence = 84,
  speedKmh = 28.5,
  distanceKm = 14.2,
  elevationGainM = 320,
}) => {
  const [activeTab, setActiveTab] = useState<'save' | 'strava' | 'garmin'>('save');

  // Strava state
  const [stravaConnected, setStravaConnected] = useState(false);
  const [stravaAthlete, setStravaAthlete] = useState<any>(null);
  const [stravaConfigured, setStravaConfigured] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [redirectUri, setRedirectUri] = useState('');
  const [isConnectingStrava, setIsConnectingStrava] = useState(false);
  const [isUploadingToStrava, setIsUploadingToStrava] = useState(false);
  const [stravaUploadResult, setStravaUploadResult] = useState<{
    success: boolean;
    stravaUrl?: string;
    message?: string;
  } | null>(null);

  const [copiedUrl, setCopiedUrl] = useState(false);
  const [activityName, setActivityName] = useState(
    route?.name ? `Ruta ${route.name} (Bkool Smart Pro)` : 'Sesión Indoor Bkool Smart Pro'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch Strava status
  const checkStravaStatus = async () => {
    try {
      const res = await fetch('/api/strava/status');
      if (res.ok) {
        const data = await res.json();
        setStravaConnected(Boolean(data.connected));
        setStravaAthlete(data.athlete || null);
        setStravaConfigured(Boolean(data.configured));
        if (data.clientId) setClientId(data.clientId);
        if (data.redirectUri) setRedirectUri(data.redirectUri);
      }
    } catch (err) {
      // ignore
    }
  };

  useEffect(() => {
    if (isOpen) {
      checkStravaStatus();
      if (route?.name) {
        setActivityName(`Ruta ${route.name} (Bkool Smart Pro)`);
      }
    }
  }, [isOpen, route]);

  // Listen for OAuth postMessage from popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'STRAVA_AUTH_SUCCESS') {
        setStravaConnected(true);
        setStravaAthlete(event.data.athlete || null);
        setIsConnectingStrava(false);
        setErrorMessage(null);
        checkStravaStatus();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  if (!isOpen) return null;

  // Build summary for TCX / GPX
  const summary: ActivitySummary = {
    name: activityName,
    startTime: new Date(Date.now() - elapsedSeconds * 1000),
    totalTimeSeconds: Math.max(1, elapsedSeconds),
    totalDistanceKm: distanceKm || (route?.totalDistanceKm ?? 10),
    avgWatts,
    maxWatts,
    avgHr,
    maxHr,
    avgCadence,
    avgSpeedKmh: speedKmh,
    totalElevationGainM: elevationGainM || (route?.totalElevationGainM ?? 200),
    caloriesKcal: Math.round(avgWatts * (elapsedSeconds / 1000) * 1.05),
  };

  const currentRoute: RouteData = route || {
    id: 'default',
    name: activityName,
    totalDistanceKm: summary.totalDistanceKm,
    totalElevationGainM: summary.totalElevationGainM,
    maxSlopePct: 8.5,
    points: [],
  };

  // Generate TCX and GPX
  const handleDownloadTcx = () => {
    const tcx = generateTcx(currentRoute, samples, summary);
    const dateStr = new Date().toISOString().slice(0, 10);
    const cleanName = activityName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    downloadFile(tcx, `${cleanName}_${dateStr}.tcx`, 'application/vnd.garmin.tcx+xml');
  };

  const handleDownloadGpx = () => {
    const gpx = generateGpx(currentRoute, samples, summary);
    const dateStr = new Date().toISOString().slice(0, 10);
    const cleanName = activityName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    downloadFile(gpx, `${cleanName}_${dateStr}.gpx`, 'application/gpx+xml');
  };

  // Connect with Strava via popup
  const handleConnectStrava = async () => {
    setIsConnectingStrava(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/strava/auth-url');
      const data = await res.json();

      if (!res.ok || !data.url) {
        throw new Error(data.error || 'No se pudo generar la URL de autorización de Strava.');
      }

      // Open OAuth provider directly in popup as per AI Studio guidelines
      const popup = window.open(
        data.url,
        'strava_oauth_popup',
        'width=600,height=750,menubar=no,toolbar=no,location=no,status=no'
      );

      if (!popup) {
        throw new Error('El navegador ha bloqueado la ventana emergente. Por favor, permite ventanas emergentes para este sitio.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al conectar con Strava');
      setIsConnectingStrava(false);
    }
  };

  // Save Strava API credentials
  const handleSaveStravaConfig = async () => {
    try {
      const res = await fetch('/api/strava/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStravaConfigured(data.configured);
        setErrorMessage(null);
        await checkStravaStatus();
      } else {
        throw new Error('Fallo al guardar credenciales de Strava.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al configurar Strava');
    }
  };

  // Disconnect Strava
  const handleDisconnectStrava = async () => {
    try {
      await fetch('/api/strava/disconnect', { method: 'POST' });
      setStravaConnected(false);
      setStravaAthlete(null);
    } catch (err) {
      // ignore
    }
  };

  // Direct upload to Strava
  const handleUploadToStrava = async () => {
    setIsUploadingToStrava(true);
    setStravaUploadResult(null);
    setErrorMessage(null);

    try {
      const tcx = generateTcx(currentRoute, samples, summary);
      const res = await fetch('/api/strava/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: activityName,
          description: `Sesión de ciclismo virtual en interior con rodillo Bkool Smart Pro y protocolo ANT+ FE-C.\nPotencia media: ${summary.avgWatts} W | Pulso medio: ${summary.avgHr} BPM | Desnivel: +${summary.totalElevationGainM} m`,
          tcxContent: tcx,
          distanceMeters: Math.round(summary.totalDistanceKm * 1000),
          elapsedSeconds: summary.totalTimeSeconds,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al subir la actividad a Strava.');
      }

      setStravaUploadResult({
        success: true,
        stravaUrl: data.stravaUrl,
        message: data.status || '¡Actividad subida con éxito a Strava!',
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Error subiendo actividad a Strava.');
      setStravaUploadResult({ success: false, message: err.message });
    } finally {
      setIsUploadingToStrava(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl bg-neutral-900 border border-white/20 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-neutral-950">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-tr from-amber-500 to-rose-600 rounded-xl">
              <Share2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Sincronizar con Garmin y Strava</h3>
              <p className="text-xs text-gray-400">Exporta y guarda tus datos de potencia, pulso y ruta</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/10 px-6 bg-neutral-900/60">
          <button
            onClick={() => setActiveTab('save')}
            className={`py-3 px-4 font-bold text-xs uppercase tracking-wider border-b-2 transition-colors ${
              activeTab === 'save'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            Guardar y Subir
          </button>
          <button
            onClick={() => setActiveTab('strava')}
            className={`flex items-center gap-1.5 py-3 px-4 font-bold text-xs uppercase tracking-wider border-b-2 transition-colors ${
              activeTab === 'strava'
                ? 'border-[#fc4c02] text-[#fc4c02]'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#fc4c02]" />
            Strava {stravaConnected ? '(Conectado)' : ''}
          </button>
          <button
            onClick={() => setActiveTab('garmin')}
            className={`flex items-center gap-1.5 py-3 px-4 font-bold text-xs uppercase tracking-wider border-b-2 transition-colors ${
              activeTab === 'garmin'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            Garmin Connect
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-3">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span className="flex-1">{errorMessage}</span>
              <button onClick={() => setErrorMessage(null)} className="text-rose-400 font-bold">
                ✕
              </button>
            </div>
          )}

          {/* TAB 1: SAVE & DIRECT UPLOAD */}
          {activeTab === 'save' && (
            <div className="space-y-5">
              {/* Activity Name Input */}
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                  Título del Entrenamiento
                </label>
                <input
                  type="text"
                  value={activityName}
                  onChange={(e) => setActivityName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-black/60 border border-white/20 text-white font-semibold text-sm focus:border-cyan-400 focus:outline-none"
                />
              </div>

              {/* Ride Summary Quick Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                <div>
                  <span className="text-[10px] text-gray-400 uppercase font-bold block">Distancia</span>
                  <span className="text-base font-black font-mono text-white">
                    {summary.totalDistanceKm.toFixed(1)} km
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 uppercase font-bold block">Tiempo</span>
                  <span className="text-base font-black font-mono text-white">
                    {Math.floor(summary.totalTimeSeconds / 60)} min
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 uppercase font-bold block">Potencia Med</span>
                  <span className="text-base font-black font-mono text-yellow-400">
                    {summary.avgWatts} W
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 uppercase font-bold block">Pulso Med</span>
                  <span className="text-base font-black font-mono text-rose-400">
                    {summary.avgHr > 0 ? `${summary.avgHr} BPM` : '--'}
                  </span>
                </div>
              </div>

              {/* Strava Direct Upload Card */}
              <div className="p-4 rounded-xl border bg-gradient-to-r from-[#fc4c02]/15 via-black/40 to-black/60 border-[#fc4c02]/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-base">Strava</span>
                    {stravaConnected ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        Conectado ({stravaAthlete?.firstname || 'Atleta'})
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-gray-400 border border-white/10">
                        No conectado
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-300">
                    Sube tu recorrido con vatios por segundo, zonas de pulso y desnivel directamente a tu perfil de Strava.
                  </p>
                </div>

                {stravaConnected ? (
                  <button
                    onClick={handleUploadToStrava}
                    disabled={isUploadingToStrava}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#fc4c02] hover:bg-[#e04300] font-bold text-xs uppercase tracking-wider text-white shadow-lg shadow-[#fc4c02]/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    {isUploadingToStrava ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> Subiendo a Strava...
                      </>
                    ) : (
                      <>
                        <UploadCloud className="w-4 h-4" /> Subir a Strava Ahora
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={() => setActiveTab('strava')}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 font-bold text-xs text-white flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    Conectar Strava
                  </button>
                )}
              </div>

              {/* Strava Success Message & Link */}
              {stravaUploadResult?.success && (
                <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs flex items-center justify-between gap-3 shadow-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    <span>{stravaUploadResult.message}</span>
                  </div>
                  {stravaUploadResult.stravaUrl && (
                    <a
                      href={stravaUploadResult.stravaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/30 hover:bg-emerald-500/50 text-white font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <span>Ver en Strava</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              )}

              {/* Garmin Connect Integration Card */}
              <div className="p-4 rounded-xl border bg-gradient-to-r from-cyan-950/30 via-black/40 to-black/60 border-cyan-500/40 space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <span className="font-bold text-white text-base">Garmin Connect</span>
                    <p className="text-xs text-gray-300 mt-0.5">
                      Descarga el archivo <strong>.TCX</strong> oficial con extensiones de potencia de Garmin y súbelo con 1 clic a Garmin Connect.
                    </p>
                  </div>
                  <button
                    onClick={openGarminConnectImport}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 font-bold text-xs text-white flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/50 transition-colors"
                  >
                    <span>Importar en Garmin Web</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 pt-1 border-t border-white/10">
                  <button
                    onClick={handleDownloadTcx}
                    className="px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-semibold text-white flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-cyan-400" /> Descargar .TCX (Garmin / Strava)
                  </button>
                  <button
                    onClick={handleDownloadGpx}
                    className="px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-semibold text-gray-300 flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-400" /> Descargar .GPX
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: STRAVA OAUTH SETTINGS */}
          {activeTab === 'strava' && (
            <div className="space-y-5 text-xs">
              {/* Connection Status Card */}
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                <div>
                  <div className="font-bold text-sm text-white flex items-center gap-2">
                    <span>Estado Strava:</span>
                    {stravaConnected ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" /> Conectado como {stravaAthlete?.firstname || ''}{' '}
                        {stravaAthlete?.lastname || ''}
                      </span>
                    ) : (
                      <span className="text-gray-400">No vinculado</span>
                    )}
                  </div>
                  <p className="text-gray-400 text-[11px] mt-0.5">
                    Permiso: <code>activity:write,read,activity:read_all</code>
                  </p>
                </div>

                {stravaConnected ? (
                  <button
                    onClick={handleDisconnectStrava}
                    className="px-3 py-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white font-bold"
                  >
                    Desconectar
                  </button>
                ) : (
                  <button
                    onClick={handleConnectStrava}
                    disabled={isConnectingStrava}
                    className="px-4 py-2 rounded-xl bg-[#fc4c02] hover:bg-[#e04300] font-bold text-white flex items-center gap-2 shadow-lg shadow-[#fc4c02]/30"
                  >
                    {isConnectingStrava ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <ExternalLink className="w-4 h-4" />
                    )}
                    Conectar con Strava
                  </button>
                )}
              </div>

              {/* Configuration Instructions */}
              <div className="p-4 rounded-xl bg-[#fc4c02]/10 border border-[#fc4c02]/30 space-y-3">
                <span className="font-bold text-white block text-sm flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[#fc4c02]" /> Pasos para vincular tu aplicación con Strava:
                </span>
                <ol className="list-decimal list-inside space-y-1.5 text-gray-300 leading-relaxed">
                  <li>
                    Abre el panel de desarrollador de Strava en{' '}
                    <a
                      href="https://www.strava.com/settings/api"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#fc4c02] underline font-semibold"
                    >
                      strava.com/settings/api
                    </a>
                  </li>
                  <li>Crea o selecciona tu aplicación Strava API.</li>
                  <li>
                    En el campo <strong>Authorization Callback Domain</strong>, introduce el dominio de tu aplicación:
                  </li>
                </ol>

                {/* Redirect URI Copy Box */}
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-black/60 border border-white/20 font-mono text-[11px] text-cyan-300">
                  <span className="flex-1 truncate">{redirectUri || 'Cargando URL de retorno...'}</span>
                  <button
                    onClick={() => copyToClipboard(redirectUri)}
                    className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-white flex items-center gap-1 transition-colors"
                  >
                    {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedUrl ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>
              </div>

              {/* Client ID & Secret configuration fields */}
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                <span className="font-bold text-white block">Credenciales Strava API (Client ID & Client Secret)</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-gray-400 text-[11px] font-bold mb-1">Client ID</label>
                    <input
                      type="text"
                      placeholder="Ej: 123456"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/20 text-white focus:border-[#fc4c02] focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 text-[11px] font-bold mb-1">Client Secret</label>
                    <input
                      type="password"
                      placeholder="••••••••••••••••••••••••••••"
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/20 text-white focus:border-[#fc4c02] focus:outline-none font-mono"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handleSaveStravaConfig}
                    className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-bold"
                  >
                    Guardar Credenciales
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: GARMIN CONNECT INSTRUCTIONS & SYNC */}
          {activeTab === 'garmin' && (
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-xl bg-cyan-950/30 border border-cyan-500/30 space-y-3">
                <span className="font-bold text-white text-sm block flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-cyan-400" /> ¿Cómo se guardan las sesiones en Garmin Connect?
                </span>
                <p className="text-gray-300 leading-relaxed">
                  Garmin Connect permite importar directamente archivos de entrenamiento completos mediante dos métodos rápidos:
                </p>

                <div className="space-y-3 pt-2">
                  <div className="p-3 rounded-lg bg-black/40 border border-white/10 space-y-1">
                    <span className="font-bold text-cyan-300 block">Opción 1: Importación Directa .TCX (Recomendada)</span>
                    <p className="text-gray-400">
                      1. Pulsa el botón <strong>&quot;Descargar .TCX&quot;</strong> en la pestaña anterior.
                    </p>
                    <p className="text-gray-400">
                      2. Pulsa <strong>&quot;Abrir Garmin Importar&quot;</strong> y arrastra el archivo a la web de Garmin Connect. ¡Tus vatios, pulso y cadencia se registrarán al segundo!
                    </p>
                    <button
                      onClick={openGarminConnectImport}
                      className="mt-2 px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold flex items-center gap-1.5"
                    >
                      <span>Abrir connect.garmin.com/modern/import-data</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="p-3 rounded-lg bg-black/40 border border-white/10 space-y-1">
                    <span className="font-bold text-amber-300 block">Opción 2: Sincronización Automática Garmin ↔ Strava</span>
                    <p className="text-gray-400">
                      Garmin y Strava tienen sincronización oficial integrada. Si vinculas tu cuenta de Garmin Connect con Strava desde los ajustes de Garmin, cada vez que subas una actividad a Strava desde este simulador, aparecerá también en tu ecosistema deportivo.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-white/10 bg-neutral-950 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
