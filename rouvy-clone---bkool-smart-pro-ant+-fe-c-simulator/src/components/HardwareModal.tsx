import React, { useState } from 'react';
import { BkoolAntFeCController } from '../utils/antFeCWebUsb';
import { WebBluetoothHrController } from '../utils/webBluetoothHr';
import { HardwareStatus, RiderSettings } from '../types/cycling';
import {
  Usb,
  Heart,
  Sliders,
  Terminal,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  X,
  Play,
  Activity,
  Zap,
  Info,
} from 'lucide-react';

interface HardwareModalProps {
  isOpen: boolean;
  onClose: () => void;
  bkoolController: BkoolAntFeCController;
  hrController: WebBluetoothHrController;
  trainerStatus: HardwareStatus;
  hrStatus: HardwareStatus;
  riderSettings: RiderSettings;
  onUpdateSettings: (newSettings: RiderSettings) => void;
  logs: string[];
}

export const HardwareModal: React.FC<HardwareModalProps> = ({
  isOpen,
  onClose,
  bkoolController,
  hrController,
  trainerStatus,
  hrStatus,
  riderSettings,
  onUpdateSettings,
  logs,
}) => {
  const [activeTab, setActiveTab] = useState<'hardware' | 'settings' | 'logs'>('hardware');
  const [localSettings, setLocalSettings] = useState<RiderSettings>(riderSettings);

  if (!isOpen) return null;

  const handleConnectUsb = async () => {
    await bkoolController.connect();
  };

  const handleConnectBleHr = async () => {
    await hrController.connect();
  };

  const handleSaveSettings = () => {
    onUpdateSettings(localSettings);
    onClose();
  };

  const statusBadge = (status: HardwareStatus, typeLabel?: string) => {
    switch (status) {
      case 'connected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" /> Conectado {typeLabel ? `(${typeLabel})` : ''}
          </span>
        );
      case 'connecting':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse">
            <Activity className="w-3.5 h-3.5 animate-spin" /> Conectando...
          </span>
        );
      case 'simulated':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
            <Play className="w-3.5 h-3.5" /> Modo Simulado / Teclado
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
            <AlertCircle className="w-3.5 h-3.5" /> Error
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-gray-500/20 text-gray-400 border border-gray-500/30">
            Desconectado
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl bg-neutral-900 border border-white/20 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-neutral-950">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-xl">
              <Usb className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Dispositivos y Calibración Bkool</h3>
              <p className="text-xs text-gray-400">Control Automático de Resistencia ANT+ FE-C y Sensores</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-white/10 px-6 bg-neutral-900/60">
          <button
            onClick={() => setActiveTab('hardware')}
            className={`flex items-center gap-2 py-3 px-4 font-bold text-xs uppercase tracking-wider border-b-2 transition-colors ${
              activeTab === 'hardware'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Usb className="w-4 h-4" /> Conexiones Hardware
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 py-3 px-4 font-bold text-xs uppercase tracking-wider border-b-2 transition-colors ${
              activeTab === 'settings'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Sliders className="w-4 h-4" /> Parámetros Ciclista
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-2 py-3 px-4 font-bold text-xs uppercase tracking-wider border-b-2 transition-colors ${
              activeTab === 'logs'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Terminal className="w-4 h-4" /> Registro de Protocolo ({logs.length})
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {activeTab === 'hardware' && (
            <div className="space-y-5">
              {/* Hardware Separation Callout */}
              <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-500/30 text-xs text-blue-200 leading-relaxed flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold text-white block">
                    Separación de Canales de Hardware (Mini PC):
                  </span>
                  <p>
                    • <strong>Rodillo Bkool Smart Pro:</strong> Conexión exclusiva a través de la WebUSB API utilizando el pincho USB ANT+ para el control continuo de pendiente en subidas y bajadas.
                  </p>
                  <p>
                    • <strong>Banda de Pulso:</strong> Conexión independiente mediante Web Bluetooth utilizando el Bluetooth integrado de tu ordenador, liberando el USB ANT+ para el rodillo.
                  </p>
                </div>
              </div>

              {/* 1. Bkool Smart Pro Trainer Card (WebUSB ANT+) */}
              <div className="p-4 rounded-xl bg-white/5 border border-cyan-500/30 space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">Rodillo Bkool Smart Pro</span>
                      {statusBadge(trainerStatus)}
                    </div>
                    <p className="text-xs text-gray-400">
                      Canal exclusivo WebUSB API • Pincho USB ANT+ FE-C (send_target_gradient)
                    </p>
                  </div>

                  {trainerStatus === 'connected' || trainerStatus === 'simulated' ? (
                    <button
                      onClick={() => bkoolController.disconnect()}
                      className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white transition-colors cursor-pointer"
                    >
                      Desconectar
                    </button>
                  ) : null}
                </div>

                {/* Connection Buttons if disconnected */}
                {trainerStatus !== 'connected' && trainerStatus !== 'simulated' && (
                  <div className="flex flex-wrap gap-2.5 pt-2 border-t border-white/10">
                    <button
                      onClick={handleConnectUsb}
                      className="px-5 py-2.5 text-xs font-bold rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white transition-all shadow-lg shadow-cyan-950/40 flex items-center gap-2 cursor-pointer"
                    >
                      <Usb className="w-4 h-4" />
                      <span>Conectar Rodillo ANT+ (WebUSB)</span>
                    </button>

                    <button
                      onClick={() => bkoolController.startSimulation()}
                      className="px-3.5 py-2 text-xs font-bold rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Simulador</span>
                    </button>
                  </div>
                )}

                {/* Automatic Resistance Status Notice */}
                <div className="p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-500/30 space-y-1 mt-2">
                  <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs">
                    <Zap className="w-4 h-4 text-cyan-400" />
                    <span>Control de Resistencia 100% Automático (GPX)</span>
                  </div>
                  <p className="text-[11px] text-gray-300 leading-relaxed">
                    Al pedalear en tu <strong>Bkool Smart Pro</strong>, la dureza se ajustará en tiempo real de forma totalmente automática según la pendiente de cada metro del track GPX (comando ANT+ FE-C <code>send_target_gradient</code>).
                  </p>
                </div>
              </div>

              {/* 2. Heart Rate Strap Card (Web Bluetooth) */}
              <div className="p-4 rounded-xl bg-white/5 border border-rose-500/30 space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">Sensor de Frecuencia Cardíaca</span>
                      {statusBadge(hrStatus)}
                    </div>
                    <p className="text-xs text-gray-400">
                      Bluetooth integrado del ordenador (Web Bluetooth API • Servicio 0x180D)
                    </p>
                  </div>

                  {hrStatus === 'connected' || hrStatus === 'simulated' ? (
                    <button
                      onClick={() => hrController.disconnect()}
                      className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white transition-colors cursor-pointer"
                    >
                      Desconectar
                    </button>
                  ) : null}
                </div>

                {hrStatus !== 'connected' && hrStatus !== 'simulated' && (
                  <div className="flex flex-wrap gap-2.5 pt-2 border-t border-white/10">
                    <button
                      onClick={handleConnectBleHr}
                      className="px-5 py-2.5 text-xs font-bold rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white transition-all shadow-lg shadow-rose-950/40 flex items-center gap-2 cursor-pointer"
                    >
                      <Heart className="w-4 h-4 fill-current" />
                      <span>Conectar Pulsómetro (Bluetooth)</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-300 font-bold mb-1">Peso del Ciclista (kg)</label>
                  <input
                    type="number"
                    min="40"
                    max="150"
                    step="0.5"
                    value={localSettings.riderWeightKg}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, riderWeightKg: parseFloat(e.target.value) || 75 })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/20 text-white focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-gray-300 font-bold mb-1">Peso de la Bicicleta (kg)</label>
                  <input
                    type="number"
                    min="5"
                    max="25"
                    step="0.1"
                    value={localSettings.bikeWeightKg}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, bikeWeightKg: parseFloat(e.target.value) || 8.5 })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/20 text-white focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-gray-300 font-bold mb-1">
                    Coeficiente Aerodinámico CdA (m²)
                  </label>
                  <input
                    type="number"
                    min="0.2"
                    max="0.6"
                    step="0.01"
                    value={localSettings.cda}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, cda: parseFloat(e.target.value) || 0.32 })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/20 text-white focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-gray-300 font-bold mb-1">
                    Velocidad de Referencia del Video (km/h)
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="60"
                    step="1"
                    value={localSettings.referenceSpeedKmh}
                    onChange={(e) =>
                      setLocalSettings({
                        ...localSettings,
                        referenceSpeedKmh: parseFloat(e.target.value) || 25,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/20 text-white focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleSaveSettings}
                  className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 font-bold text-white transition-colors"
                >
                  Guardar Configuración
                </button>
              </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="space-y-2">
              <div className="h-64 overflow-y-auto p-3 rounded-xl bg-black border border-white/10 font-mono text-[11px] text-emerald-400 space-y-1">
                {logs.length === 0 ? (
                  <span className="text-gray-500">Sin registros de protocolo aún. Conecta el pincho ANT+ para comenzar.</span>
                ) : (
                  logs.map((log, idx) => (
                    <div key={idx} className="leading-tight">
                      {log}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-white/10 bg-neutral-950 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
