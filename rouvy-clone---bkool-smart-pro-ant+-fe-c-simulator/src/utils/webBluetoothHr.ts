/**
 * Controlador para Sensor de Frecuencia Cardíaca (Banda de Pulsos Bkool / BLE HR)
 * Compatible con Web Bluetooth Heart Rate Profile (0x180D / 0x2A37)
 */

import { HardwareStatus } from '../types/cycling';

export interface HeartRateCallbacks {
  onHeartRate: (bpm: number) => void;
  onStatusChange: (status: HardwareStatus, message?: string) => void;
  onLog?: (message: string) => void;
}

export class WebBluetoothHrController {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private isConnected = false;
  private isSimulated = false;
  private callbacks: HeartRateCallbacks;

  // Simulation
  private simulatedBpm = 135;
  private simInterval: any = null;

  constructor(callbacks: HeartRateCallbacks) {
    this.callbacks = callbacks;
  }

  public setCallbacks(newCallbacks: Partial<HeartRateCallbacks>): void {
    this.callbacks = { ...this.callbacks, ...newCallbacks };
  }

  public get connected(): boolean {
    return this.isConnected || this.isSimulated;
  }

  public get simulated(): boolean {
    return this.isSimulated;
  }

  public get deviceName(): string {
    if (this.isSimulated) return 'Banda de Pulso (Simulada)';
    if (this.device) return this.device.name || 'Banda Cardíaca BLE';
    return 'Desconectado';
  }

  private log(msg: string) {
    if (this.callbacks.onLog) {
      this.callbacks.onLog(`[BLE HR] ${msg}`);
    }
  }

  /**
   * Conecta con la banda de pulso mediante Web Bluetooth
   */
  public async connect(): Promise<boolean> {
    if (!navigator.bluetooth) {
      const msg = 'Web Bluetooth no está disponible en este navegador.';
      this.log(msg);
      this.callbacks.onStatusChange('error', msg);
      return false;
    }

    try {
      this.callbacks.onStatusChange('connecting', 'Escaneando pulsómetro BLE...');
      this.log('Solicitando dispositivo de frecuencia cardíaca (0x180D)...');

      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['heart_rate'] }],
        optionalServices: ['battery_service', 'device_information'],
      });

      this.device = device;
      this.log(`Dispositivo seleccionado: ${device.name || 'Pulsómetro'}`);

      device.addEventListener('gattserverdisconnected', () => {
        this.log('Pulsómetro desconectado por el sistema.');
        this.isConnected = false;
        this.callbacks.onStatusChange('disconnected', 'Pulsómetro desconectado');
      });

      this.server = await device.gatt!.connect();
      const service = await this.server.getPrimaryService('heart_rate');
      this.characteristic = await service.getCharacteristic('heart_rate_measurement');

      await this.characteristic.startNotifications();
      this.characteristic.addEventListener('characteristicvaluechanged', (event: any) => {
        const value: DataView = event.target.value;
        this.parseHeartRate(value);
      });

      this.isConnected = true;
      this.isSimulated = false;
      this.callbacks.onStatusChange('connected', `Conectado a ${device.name || 'Banda de Pulso'}`);
      this.log('Notificaciones de frecuencia cardíaca activadas.');
      return true;
    } catch (err: any) {
      this.log(`Error al conectar pulsómetro: ${err?.message || err}`);
      this.callbacks.onStatusChange('error', err?.message || 'Error de conexión BLE');
      return false;
    }
  }

  /**
   * Parsea la característica 0x2A37 según la especificación oficial Bluetooth SIG
   */
  private parseHeartRate(dataView: DataView): void {
    const flags = dataView.getUint8(0);
    // Bit 0: 0 = UINT8 (1 byte bpm), 1 = UINT16 (2 byte bpm)
    let bpm = 0;
    if ((flags & 0x01) === 0) {
      bpm = dataView.getUint8(1);
    } else {
      bpm = dataView.getUint16(1, true); // little endian
    }

    if (bpm > 30 && bpm < 240) {
      this.callbacks.onHeartRate(bpm);
    }
  }

  /**
   * Modo simulación de pulso (útil para pruebas)
   */
  public startSimulation(initialBpm = 135): void {
    this.isSimulated = true;
    this.isConnected = false;
    this.simulatedBpm = initialBpm;
    this.callbacks.onStatusChange('simulated', 'Pulsómetro Simulado');
    this.log('Iniciando pulsómetro simulado.');

    if (this.simInterval) clearInterval(this.simInterval);

    this.simInterval = setInterval(() => {
      // Subtle pulse variance (+- 1 bpm)
      const drift = Math.floor(Math.random() * 3) - 1;
      this.simulatedBpm = Math.max(90, Math.min(195, this.simulatedBpm + drift));
      this.callbacks.onHeartRate(this.simulatedBpm);
    }, 1000);
  }

  public setSimulatedBpm(bpm: number): void {
    this.simulatedBpm = Math.max(50, Math.min(220, bpm));
  }

  public async disconnect(): Promise<void> {
    if (this.simInterval) {
      clearInterval(this.simInterval);
      this.simInterval = null;
    }

    if (this.server && this.server.connected) {
      try {
        if (this.characteristic) {
          await this.characteristic.stopNotifications();
        }
        this.server.disconnect();
      } catch (err) {
        // ignore
      }
    }

    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.isConnected = false;
    this.isSimulated = false;
    this.callbacks.onStatusChange('disconnected', 'Pulsómetro desconectado');
  }
}
