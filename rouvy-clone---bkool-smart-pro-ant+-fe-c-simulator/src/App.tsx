/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { RouteData, RiderSettings, HardwareStatus, TelemetrySample } from './types/cycling';
import { BkoolAntFeCController } from './utils/antFeCWebUsb';
import { WebBluetoothHrController } from './utils/webBluetoothHr';
import { WelcomeScreen } from './components/WelcomeScreen';
import { RouvySimulator } from './components/RouvySimulator';
import { HardwareModal } from './components/HardwareModal';
import { SyncServicesModal } from './components/SyncServicesModal';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'welcome' | 'simulator'>('welcome');
  const [activeRoute, setActiveRoute] = useState<RouteData | null>(null);
  const [activeVideoUrl, setActiveVideoUrl] = useState<string>('');

  const [trainerStatus, setTrainerStatus] = useState<HardwareStatus>('disconnected');
  const [hrStatus, setHrStatus] = useState<HardwareStatus>('disconnected');
  const [isHardwareModalOpen, setIsHardwareModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  // Telemetry samples & session summary for Garmin/Strava sync
  const [sessionSamples, setSessionSamples] = useState<TelemetrySample[]>([]);
  const [sessionElapsedSecs, setSessionElapsedSecs] = useState<number>(0);
  const [sessionWatts, setSessionWatts] = useState<number>(180);
  const [sessionHr, setSessionHr] = useState<number>(135);
  const [sessionCadence, setSessionCadence] = useState<number>(85);
  const [sessionSpeedKmh, setSessionSpeedKmh] = useState<number>(28);
  const [sessionDistanceKm, setSessionDistanceKm] = useState<number>(12);

  // Rider & bike physical parameters
  const [riderSettings, setRiderSettings] = useState<RiderSettings>({
    riderWeightKg: 75.0,
    bikeWeightKg: 8.5,
    cda: 0.32,
    crr: 0.004,
    referenceSpeedKmh: 25.0,
  });

  const appendLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 80)]);
  }, []);

  // Bkool ANT+ FE-C Controller reference
  const bkoolControllerRef = useRef<BkoolAntFeCController | null>(null);
  if (!bkoolControllerRef.current) {
    bkoolControllerRef.current = new BkoolAntFeCController({
      onData: () => {},
      onStatusChange: (status, message) => {
        setTrainerStatus(status);
        if (message) appendLog(message);
      },
      onLog: (msg) => appendLog(msg),
    });
  }

  // BLE Heart Rate Controller reference
  const hrControllerRef = useRef<WebBluetoothHrController | null>(null);
  if (!hrControllerRef.current) {
    hrControllerRef.current = new WebBluetoothHrController({
      onHeartRate: () => {},
      onStatusChange: (status, message) => {
        setHrStatus(status);
        if (message) appendLog(message);
      },
      onLog: (msg) => appendLog(msg),
    });
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      bkoolControllerRef.current?.disconnect();
      hrControllerRef.current?.disconnect();
    };
  }, []);

  const handleStartSession = (route: RouteData, videoUrl: string) => {
    setActiveRoute(route);
    setActiveVideoUrl(videoUrl);
    setCurrentScreen('simulator');

    // If trainer isn't connected yet, open hardware modal so user can connect their USB ANT+ stick
    if (trainerStatus === 'disconnected') {
      setIsHardwareModalOpen(true);
    }
  };

  const handleExitSession = () => {
    // Open sync modal so user can save/upload their finished ride to Strava and Garmin!
    setIsSyncModalOpen(true);
    setCurrentScreen('welcome');
  };

  const handleOpenSyncFromSimulator = (data?: any) => {
    if (data) {
      if (data.samples) setSessionSamples(data.samples);
      if (data.elapsedSeconds) setSessionElapsedSecs(data.elapsedSeconds);
      if (data.powerWatts) setSessionWatts(data.powerWatts);
      if (data.heartRateBpm) setSessionHr(data.heartRateBpm);
      if (data.speedKmh) setSessionSpeedKmh(data.speedKmh);
      if (data.cadenceRpm) setSessionCadence(data.cadenceRpm);
      if (data.currentDistanceKm) setSessionDistanceKm(data.currentDistanceKm);
    }
    setIsSyncModalOpen(true);
  };

  return (
    <div className="w-full min-h-screen bg-black text-white select-none">
      {currentScreen === 'welcome' && (
        <WelcomeScreen
          onStartSession={handleStartSession}
          trainerStatus={trainerStatus}
          hrStatus={hrStatus}
          onOpenHardwareModal={() => setIsHardwareModalOpen(true)}
          onOpenSyncModal={() => setIsSyncModalOpen(true)}
          onConnectTrainer={() => {
            if (trainerStatus === 'connected' || trainerStatus === 'simulated') {
              bkoolControllerRef.current?.disconnect();
            } else {
              bkoolControllerRef.current?.connect();
            }
          }}
          onConnectHr={() => {
            if (hrStatus === 'connected' || hrStatus === 'simulated') {
              hrControllerRef.current?.disconnect();
            } else {
              hrControllerRef.current?.connect();
            }
          }}
        />
      )}

      {currentScreen === 'simulator' && activeRoute && (
        <RouvySimulator
          route={activeRoute}
          videoUrl={activeVideoUrl}
          riderSettings={riderSettings}
          bkoolController={bkoolControllerRef.current!}
          hrController={hrControllerRef.current!}
          trainerStatus={trainerStatus}
          hrStatus={hrStatus}
          onOpenHardwareModal={() => setIsHardwareModalOpen(true)}
          onOpenSyncModal={handleOpenSyncFromSimulator}
          onExitSession={handleExitSession}
        />
      )}

      {/* Global Hardware & Settings Modal */}
      <HardwareModal
        isOpen={isHardwareModalOpen}
        onClose={() => setIsHardwareModalOpen(false)}
        bkoolController={bkoolControllerRef.current!}
        hrController={hrControllerRef.current!}
        trainerStatus={trainerStatus}
        hrStatus={hrStatus}
        riderSettings={riderSettings}
        onUpdateSettings={setRiderSettings}
        logs={logs}
      />

      {/* Garmin Connect & Strava Synchronization Modal */}
      <SyncServicesModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        route={activeRoute}
        samples={sessionSamples}
        elapsedSeconds={sessionElapsedSecs || 1800}
        avgWatts={sessionWatts || 190}
        avgHr={sessionHr || 140}
        avgCadence={sessionCadence || 85}
        speedKmh={sessionSpeedKmh || 28}
        distanceKm={sessionDistanceKm || (activeRoute?.totalDistanceKm ?? 12)}
        elevationGainM={activeRoute?.totalElevationGainM ?? 250}
      />
    </div>
  );
}
