import { RiderSettings } from '../types/cycling';

export class CyclingPhysicsEngine {
  private riderWeightKg: number;
  private bikeWeightKg: number;
  private cda: number;
  private crr: number;
  private airDensity: number;
  private gravity: number;
  private drivetrainEfficiency: number;
  private currentSpeedMs: number;

  constructor(settings?: Partial<RiderSettings>) {
    this.riderWeightKg = settings?.riderWeightKg ?? 75.0;
    this.bikeWeightKg = settings?.bikeWeightKg ?? 8.5;
    this.cda = settings?.cda ?? 0.32;
    this.crr = settings?.crr ?? 0.004;
    this.airDensity = 1.225; // kg/m^3 (sea level, 15°C)
    this.gravity = 9.80665; // m/s^2
    this.drivetrainEfficiency = 0.97; // 97% drivetrain efficiency
    this.currentSpeedMs = 0.0;
  }

  public updateSettings(settings: Partial<RiderSettings>): void {
    if (settings.riderWeightKg !== undefined) this.riderWeightKg = settings.riderWeightKg;
    if (settings.bikeWeightKg !== undefined) this.bikeWeightKg = settings.bikeWeightKg;
    if (settings.cda !== undefined) this.cda = settings.cda;
    if (settings.crr !== undefined) this.crr = settings.crr;
  }

  public get totalMass(): number {
    return this.riderWeightKg + this.bikeWeightKg;
  }

  /**
   * Calculates steady-state speed using Newton-Raphson method for the cubic equilibrium:
   * (0.5 * rho * CdA) * v^3 + (m * g * (sin(theta) + Crr * cos(theta))) * v - P_effective = 0
   */
  public calculateSteadySpeed(powerWatts: number, slopePct: number): number {
    const grade = slopePct / 100.0;
    const theta = Math.atan(grade);
    const effectivePower = Math.max(0.0, powerWatts) * this.drivetrainEfficiency;

    // Cubic aero drag coefficient A
    const A = 0.5 * this.airDensity * this.cda;
    // Linear slope + rolling resistance coefficient B
    const B = this.totalMass * this.gravity * (Math.sin(theta) + this.crr * Math.cos(theta));

    // Coasting downhill with negative resistance (freewheeling)
    if (effectivePower <= 0.0 && B < 0) {
      // Terminal downhill velocity: A*v^3 + B*v = 0 -> v = sqrt(-B / A)
      const terminalSpeed = Math.sqrt(-B / A);
      // Cap at 85 km/h (~23.6 m/s) for safety realism
      return Math.min(23.6, terminalSpeed);
    }

    if (effectivePower <= 0.0 && B >= 0) {
      return 0.0;
    }

    // Newton-Raphson iteration to find steady speed v (m/s)
    let v = Math.max(0.1, this.currentSpeedMs);
    for (let i = 0; i < 25; i++) {
      const f = A * Math.pow(v, 3) + B * v - effectivePower;
      const fPrime = 3.0 * A * Math.pow(v, 2) + B;
      if (Math.abs(fPrime) < 1e-6) break;

      const vNext = v - f / fPrime;
      if (Math.abs(vNext - v) < 1e-4) {
        v = vNext;
        break;
      }
      v = Math.max(0.0, vNext);
    }

    return Math.max(0.0, v);
  }

  /**
   * Updates virtual speed applying realistic momentum and inertia over time delta dtSeconds.
   * Returns virtual speed in km/h.
   */
  public updateVirtualSpeed(powerWatts: number, slopePct: number, dtSeconds = 0.1): number {
    if (powerWatts <= 0 && slopePct >= 0) {
      // Natural deceleration when pedaling stops on flat or uphill
      const decelMs2 = Math.max(0.2, 0.4 + slopePct * 0.08);
      this.currentSpeedMs = Math.max(0.0, this.currentSpeedMs - decelMs2 * dtSeconds);
      return this.currentSpeedMs * 3.6;
    }

    const steadySpeedMs = this.calculateSteadySpeed(powerWatts, slopePct);

    // Inertia rate (bikes have angular and translational momentum)
    const inertiaRate = 0.35 * dtSeconds;
    this.currentSpeedMs += (steadySpeedMs - this.currentSpeedMs) * Math.min(1.0, inertiaRate);

    return Math.max(0.0, this.currentSpeedMs * 3.6);
  }

  public reset(): void {
    this.currentSpeedMs = 0.0;
  }
}
