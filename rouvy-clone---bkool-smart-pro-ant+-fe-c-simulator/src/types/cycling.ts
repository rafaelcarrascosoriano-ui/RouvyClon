export interface GpxPoint {
  distanceKm: number;
  elevationM: number;
  slopePct: number;
  lat: number;
  lon: number;
  time?: string;
}

export interface RouteData {
  id: string;
  name: string;
  totalDistanceKm: number;
  totalElevationGainM: number;
  maxSlopePct: number;
  points: GpxPoint[];
  videoUrl?: string;
  videoFileName?: string;
  gpxFileName?: string;
}

export interface RiderSettings {
  riderWeightKg: number;
  bikeWeightKg: number;
  cda: number;
  crr: number;
  referenceSpeedKmh: number; // reference recording speed for video sync (default 25 km/h)
}

export interface LiveTelemetry {
  powerWatts: number;
  cadenceRpm: number;
  speedKmh: number;
  heartRateBpm: number;
  slopePct: number;
  distanceKm: number;
  elevationM: number;
  caloriesKcal: number;
  elapsedSeconds: number;
  virtualPlaybackRate: number;
  bkoolTargetGradeSent: number;
  lastSentTimestamp: number;
}

export interface TelemetrySample {
  timeSec: number;
  timeFormatted: string;
  powerWatts: number;
  heartRateBpm: number;
  speedKmh: number;
  cadenceRpm: number;
  slopePct: number;
  distanceKm: number;
}

export type HardwareStatus = 'disconnected' | 'connecting' | 'connected' | 'simulated' | 'error';

export interface DeviceInfo {
  name: string;
  type: 'ant-fec' | 'ble-hr' | 'simulated';
  status: HardwareStatus;
  details?: string;
}
