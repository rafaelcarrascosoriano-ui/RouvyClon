/**
 * Controlador de Rodillo Bkool Smart Pro mediante WebUSB API Exclusiva (ANT+ FE-C)
 * 
 * Canal de hardware exclusivo:
 * - Sesión WebUSB dedicada 100% al pincho USB ANT+ para la comunicación con el rodillo.
 * - Canal 0 ANT+ FE-C (Fitness Equipment Control, Perfil 17 / 0x11):
 *   - Recepción continua de Potencia Instantánea (W) y Cadencia (RPM) [Data Page 25].
 *   - Recepción de Velocidad virtual [Data Page 16].
 *   - Envío ininterrumpido en tiempo real de send_target_gradient [Data Page 51: 0x33]
 *     para variar la resistencia del Bkool Smart Pro según la pendiente de la ruta GPX.
 * 
 * (La banda de pulso está completamente desacoplada de este USB y se gestiona
 * mediante Web Bluetooth a través del Bluetooth integrado del ordenador).
 */

import { HardwareStatus } from '../types/cycling';

// Constantes de Trama ANT
const ANT_SYNC_BYTE = 0xA4;

// Message IDs oficiales ANT
const MSG_RESET_SYSTEM = 0x4A;
const MSG_NETWORK_KEY = 0x46;
const MSG_ASSIGN_CHANNEL = 0x42;
const MSG_CHANNEL_ID = 0x51;
const MSG_CHANNEL_RF_FREQ = 0x45;
const MSG_CHANNEL_PERIOD = 0x43;
const MSG_OPEN_CHANNEL = 0x4B;
const MSG_CLOSE_CHANNEL = 0x4C;
const MSG_BROADCAST_DATA = 0x4E;
const MSG_ACKNOWLEDGED_DATA = 0x4F;

// Perfil FE-C (Bkool Smart Pro)
const FEC_DEVICE_TYPE = 0x11; // 17: Fitness Equipment Control
const FEC_RF_FREQ = 57;        // 2457 MHz
const FEC_PERIOD = 8192;       // ~4.06 Hz (32768 / 8192)

// Clave pública oficial ANT+ Sport
const ANT_PLUS_NETWORK_KEY = new Uint8Array([0xB9, 0xA5, 0x21, 0xFB, 0xBD, 0x72, 0xC3, 0x45]);

// IDs de fabricantes de pinchos USB ANT+
export const KNOWN_ANT_USB_FILTERS = [
  { vendorId: 0x0FCF }, // Garmin / Dynastream Innovations (ANTUSB-m, ANTUSB2)
  { vendorId: 0x10C4 }, // Silicon Labs CP210x (Pincho USB oficial Bkool)
  { vendorId: 0x1A86 }, // WCH CH340 / CH341 (Cycplus, CooSpo, Taida, Anself)
  { vendorId: 0x0403 }, // FTDI FT232
  { vendorId: 0x1915 }, // Nordic Semiconductor nRF51
];

export interface BkoolTrainerCallbacks {
  onData: (powerWatts: number, cadenceRpm: number, speedKmh: number) => void;
  onStatusChange: (status: HardwareStatus, message?: string) => void;
  onLog?: (message: string) => void;
  onGradeAck?: (grade: number) => void;
}

export class BkoolAntFeCController {
  private usbDevice: USBDevice | null = null;
  private endpointIn: USBEndpoint | null = null;
  private endpointOut: USBEndpoint | null = null;

  private isReading = false;
  private isConnected = false;
  private isSimulated = false;

  private callbacks: BkoolTrainerCallbacks;

  // Resistance management
  private currentTargetGrade = 0.0;
  private resistanceKeepAliveTimer: any = null;
  private lastGradeSent: number | null = null;

  // Simulation state (fallback if device not present)
  private simulatedWatts = 180;
  private simulatedCadence = 85;
  private simInterval: any = null;

  // Raw buffer for framing
  private incomingBuffer = new Uint8Array(0);

  constructor(callbacks: BkoolTrainerCallbacks) {
    this.callbacks = callbacks;
  }

  public setCallbacks(newCallbacks: Partial<BkoolTrainerCallbacks>): void {
    this.callbacks = { ...this.callbacks, ...newCallbacks };
  }

  public get connected(): boolean {
    return this.isConnected || this.isSimulated;
  }

  public get simulated(): boolean {
    return this.isSimulated;
  }

  public get deviceName(): string {
    if (this.isSimulated) return 'Bkool Smart Pro (Simulador)';
    if (this.usbDevice) return this.usbDevice.productName || 'Pincho USB ANT+ (WebUSB)';
    return 'Desconectado';
  }

  private log(msg: string) {
    if (this.callbacks.onLog) {
      this.callbacks.onLog(`[WebUSB ANT+] ${msg}`);
    }
  }

  /**
   * Construye una trama ANT: [SYNC (0xA4), LENGTH, MSG_ID, DATA..., CHECKSUM]
   */
  private buildAntMessage(msgId: number, data: number[] = []): Uint8Array {
    const length = data.length;
    const buffer = new Uint8Array(4 + length);
    buffer[0] = ANT_SYNC_BYTE;
    buffer[1] = length;
    buffer[2] = msgId;

    for (let i = 0; i < length; i++) {
      buffer[3 + i] = data[i];
    }

    let checksum = 0;
    for (let i = 0; i < 3 + length; i++) {
      checksum ^= buffer[i];
    }
    buffer[3 + length] = checksum;

    return buffer;
  }

  /**
   * Envía un paquete ANT a través de la transferencia Bulk OUT de WebUSB
   */
  private async sendAntMessage(msgId: number, data: number[] = []): Promise<boolean> {
    if (!this.usbDevice || !this.endpointOut) return false;
    try {
      const packet = this.buildAntMessage(msgId, data);
      await this.usbDevice.transferOut(this.endpointOut.endpointNumber, packet.buffer as ArrayBuffer);
      return true;
    } catch (err: any) {
      this.log(`Error enviando mensaje 0x${msgId.toString(16)}: ${err?.message || err}`);
      return false;
    }
  }

  // =========================================================================
  // CONEXIÓN EXCLUSIVA MEDIANTE WEBUSB API (Pincho USB ANT+)
  // =========================================================================
  public async connect(): Promise<boolean> {
    if (!navigator.usb) {
      const msg = 'WebUSB no está disponible en este navegador. Utiliza Google Chrome, Microsoft Edge u Opera.';
      this.log(msg);
      this.callbacks.onStatusChange('error', msg);
      return false;
    }

    try {
      this.callbacks.onStatusChange('connecting', 'Abriendo selector WebUSB para pincho ANT+...');
      this.log('Solicitando dispositivo WebUSB ANT+...');

      let device: USBDevice;
      try {
        device = await navigator.usb.requestDevice({ filters: KNOWN_ANT_USB_FILTERS });
      } catch (filterErr) {
        // Si el dongle USB tiene un VID alternativo, permitir seleccionarlo directamente
        this.log('Abriendo selector WebUSB general...');
        device = await navigator.usb.requestDevice({ filters: [] });
      }

      this.usbDevice = device;
      this.log(`Dispositivo WebUSB conectado: ${device.productName || 'USB ANT+ Stick'}`);

      await device.open();
      if (device.configuration === null) {
        await device.selectConfiguration(1);
      }

      await device.claimInterface(0);

      const iface = device.configuration?.interfaces[0];
      const alternate = iface?.alternates[0];

      this.endpointIn = alternate?.endpoints.find((e: USBEndpoint) => e.direction === 'in') || null;
      this.endpointOut = alternate?.endpoints.find((e: USBEndpoint) => e.direction === 'out') || null;

      if (!this.endpointIn || !this.endpointOut) {
        throw new Error('No se encontraron endpoints Bulk IN/OUT en el pincho USB ANT+');
      }

      this.log(`Endpoints WebUSB activos: IN #${this.endpointIn.endpointNumber}, OUT #${this.endpointOut.endpointNumber}`);

      this.isConnected = true;
      this.isSimulated = false;

      // Iniciar bucle de lectura USB dedicado
      this.startUsbReadingLoop();

      // Configurar sesión exclusiva para Bkool Smart Pro (FE-C)
      await this.initBkoolFeCChannel();

      this.callbacks.onStatusChange('connected', 'Bkool Smart Pro conectado vía WebUSB ANT+');
      this.startResistanceKeepAlive();
      return true;
    } catch (err: any) {
      this.log(`Error al conectar con WebUSB: ${err?.message || err}`);
      this.callbacks.onStatusChange('error', err?.message || 'Error de conexión WebUSB');
      return false;
    }
  }

  // =========================================================================
  // INICIALIZACIÓN CANAL 0 EXCLUSIVO: BKOOL SMART PRO (ANT+ FE-C)
  // =========================================================================
  private async initBkoolFeCChannel(): Promise<void> {
    const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

    this.log('1. Reiniciando chip ANT+ en puerto USB...');
    await this.sendAntMessage(MSG_RESET_SYSTEM, [0x00]);
    await delay(300);

    this.log('2. Configurando clave de red ANT+ Sport...');
    await this.sendAntMessage(MSG_NETWORK_KEY, [0x00, ...Array.from(ANT_PLUS_NETWORK_KEY)]);
    await delay(100);

    this.log('3. Asignando Canal 0 exclusivo para Bkool Smart Pro (FE-C Perfil 17)...');
    // Channel 0, Type 0x00 (Slave Receive / Bidirectional), Network 0
    await this.sendAntMessage(MSG_ASSIGN_CHANNEL, [0x00, 0x00, 0x00]);
    await delay(60);

    // Channel ID: Device Number 0 (Wildcard para vincular al Bkool Pro), Device Type 17 (FE-C)
    await this.sendAntMessage(MSG_CHANNEL_ID, [0x00, 0x00, 0x00, FEC_DEVICE_TYPE, 0x00]);
    await delay(60);

    // Frecuencia RF: 2457 MHz (freq 57)
    await this.sendAntMessage(MSG_CHANNEL_RF_FREQ, [0x00, FEC_RF_FREQ]);
    await delay(60);

    // Periodo FE-C: 8192 (~4.06 Hz)
    await this.sendAntMessage(MSG_CHANNEL_PERIOD, [0x00, FEC_PERIOD & 0xFF, (FEC_PERIOD >> 8) & 0xFF]);
    await delay(60);

    // Abrir Canal 0
    await this.sendAntMessage(MSG_OPEN_CHANNEL, [0x00]);
    await delay(100);

    this.log('Sesión WebUSB dedicada y abierta para Bkool Smart Pro. Listo para pedalear.');
  }

  // =========================================================================
  // LECTURA USB Y DESEMPAQUETADO
  // =========================================================================
  private async startUsbReadingLoop(): Promise<void> {
    if (!this.usbDevice || !this.endpointIn) return;
    this.isReading = true;

    while (this.isReading && this.usbDevice.opened) {
      try {
        const result = await this.usbDevice.transferIn(this.endpointIn.endpointNumber, 64);
        if (result.data && result.data.byteLength > 0) {
          const raw = new Uint8Array(result.data.buffer);
          this.processRawBytes(raw);
        }
      } catch (err) {
        if (!this.isReading) break;
        await new Promise((res) => setTimeout(res, 40));
      }
    }
  }

  private processRawBytes(chunk: Uint8Array): void {
    const next = new Uint8Array(this.incomingBuffer.length + chunk.length);
    next.set(this.incomingBuffer, 0);
    next.set(chunk, this.incomingBuffer.length);
    this.incomingBuffer = next;

    let offset = 0;
    while (offset < this.incomingBuffer.length) {
      if (this.incomingBuffer[offset] !== ANT_SYNC_BYTE) {
        offset++;
        continue;
      }

      if (offset + 3 > this.incomingBuffer.length) break;
      const length = this.incomingBuffer[offset + 1];
      const msgId = this.incomingBuffer[offset + 2];
      const packetEnd = offset + 4 + length;

      if (packetEnd > this.incomingBuffer.length) break;

      const packetData = this.incomingBuffer.slice(offset + 3, offset + 3 + length);

      // Checksum
      let checksum = 0;
      for (let i = offset; i < packetEnd - 1; i++) {
        checksum ^= this.incomingBuffer[i];
      }
      const actualChecksum = this.incomingBuffer[packetEnd - 1];

      if (checksum === actualChecksum) {
        this.handleAntMessage(msgId, packetData);
      }

      offset = packetEnd;
    }

    if (offset > 0) {
      this.incomingBuffer = this.incomingBuffer.slice(offset);
    }
  }

  private handleAntMessage(msgId: number, data: Uint8Array): void {
    if (msgId === MSG_BROADCAST_DATA || msgId === MSG_ACKNOWLEDGED_DATA) {
      const channel = data[0];
      const payload = data.slice(1, 9);

      // Procesar datos del rodillo Bkool (Canal 0)
      if (channel === 0 && payload.length >= 8) {
        const pageNumber = payload[0];

        // Page 25 (0x19): Datos específicos del rodillo Bkool (Potencia W y Cadencia RPM)
        if (pageNumber === 0x19) {
          const cadence = payload[2];
          const powerLsb = payload[5];
          const powerMsb = payload[6] & 0x0F;
          const powerWatts = (powerMsb << 8) | powerLsb;

          this.callbacks.onData(powerWatts, cadence, 0);
        }
        // Page 16 (0x10): Datos generales (Velocidad)
        else if (pageNumber === 0x10) {
          const speedRaw = payload[4] | (payload[5] << 8);
          const speedKmh = (speedRaw * 0.001) * 3.6;
          this.callbacks.onData(0, 0, Math.round(speedKmh * 10) / 10);
        }
      }
    }
  }

  // =========================================================================
  // CONTROL AUTOMÁTICO DE RESISTENCIA DEL BKOOL SMART PRO
  // Comando FE-C Page 51 (send_target_gradient)
  // =========================================================================
  public async sendTargetGradient(slopePct: number): Promise<boolean> {
    this.currentTargetGrade = slopePct;

    if (this.isSimulated) {
      if (this.callbacks.onGradeAck) this.callbacks.onGradeAck(slopePct);
      return true;
    }

    if (!this.isConnected || !this.usbDevice) return false;

    try {
      const clampedSlope = Math.max(-15.0, Math.min(20.0, slopePct));
      const rawGrade = Math.round((clampedSlope + 200.0) * 100);
      const gradeLsb = rawGrade & 0xFF;
      const gradeMsb = (rawGrade >> 8) & 0xFF;

      // Data Page 51 (0x33): Track Resistance / Target Gradient
      const page51Payload = [
        0x00, // Channel 0 (Bkool FE-C)
        0x33, // Data Page 51
        0xFF,
        0xFF,
        0xFF,
        0xFF,
        gradeLsb,
        gradeMsb,
        0xFF, // Crr default
      ];

      const sent = await this.sendAntMessage(MSG_ACKNOWLEDGED_DATA, page51Payload);

      if (this.lastGradeSent === null || Math.abs(this.lastGradeSent - slopePct) >= 0.2) {
        this.log(`send_target_gradient: ${slopePct > 0 ? '+' : ''}${slopePct.toFixed(1)}% -> Bkool Smart Pro`);
        this.lastGradeSent = slopePct;
        if (this.callbacks.onGradeAck) this.callbacks.onGradeAck(slopePct);
      }

      return sent;
    } catch (err: any) {
      this.log(`Error enviando resistencia al rodillo: ${err?.message || err}`);
      return false;
    }
  }

  /**
   * Keep-Alive continuo de resistencia: envía la pendiente cada 900ms
   * para mantener la dureza del rodillo bloqueada en la pendiente de la ruta.
   */
  private startResistanceKeepAlive(): void {
    if (this.resistanceKeepAliveTimer) clearInterval(this.resistanceKeepAliveTimer);

    this.resistanceKeepAliveTimer = setInterval(() => {
      if (this.isConnected && !this.isSimulated) {
        this.sendTargetGradient(this.currentTargetGrade);
      }
    }, 900);
  }

  // =========================================================================
  // SIMULACIÓN (Fallback)
  // =========================================================================
  public startSimulation(): void {
    this.isSimulated = true;
    this.isConnected = false;
    this.callbacks.onStatusChange('simulated', 'Modo Simulación Activo');
    this.log('Iniciando simulación interactiva.');

    if (this.simInterval) clearInterval(this.simInterval);

    this.simInterval = setInterval(() => {
      const flutter = Math.floor(Math.random() * 7) - 3;
      const currentW = Math.max(0, this.simulatedWatts + flutter);
      const currentCad = currentW > 0 ? this.simulatedCadence + Math.floor(Math.random() * 3) - 1 : 0;
      this.callbacks.onData(currentW, currentCad, 0);
    }, 250);
  }

  public setSimulatedWatts(watts: number): void {
    this.simulatedWatts = Math.max(0, Math.min(1000, watts));
    this.simulatedCadence = this.simulatedWatts > 0 ? Math.min(115, Math.max(55, Math.round(60 + this.simulatedWatts * 0.12))) : 0;
  }

  public getSimulatedWatts(): number {
    return this.simulatedWatts;
  }

  public async disconnect(): Promise<void> {
    this.isReading = false;
    if (this.resistanceKeepAliveTimer) {
      clearInterval(this.resistanceKeepAliveTimer);
      this.resistanceKeepAliveTimer = null;
    }
    if (this.simInterval) {
      clearInterval(this.simInterval);
      this.simInterval = null;
    }

    try {
      if (this.usbDevice && this.usbDevice.opened) {
        await this.sendAntMessage(MSG_CLOSE_CHANNEL, [0x00]);
        await this.usbDevice.close();
        this.usbDevice = null;
      }
    } catch (e) {
      // ignore
    }

    this.isConnected = false;
    this.isSimulated = false;
    this.callbacks.onStatusChange('disconnected', 'Bkool Smart Pro desconectado');
    this.log('Sesión WebUSB cerrada.');
  }
}
