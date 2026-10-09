import { registerPlugin } from '@capacitor/core'

export interface NativePairedBluetoothDevice {
  id: string
  name: string
  address: string
  class?: number
}

interface PachaxBluetoothPrinterPlugin {
  getState(): Promise<{ enabled: boolean; connected: boolean }>
  listPairedDevices(): Promise<{ devices: NativePairedBluetoothDevice[] }>
  connect(options: { address: string }): Promise<{ connected: boolean }>
  disconnect(): Promise<{ disconnected: boolean }>
  write(options: { dataBase64: string }): Promise<{ bytesWritten: number }>
}

const PachaxBluetoothPrinter = registerPlugin<PachaxBluetoothPrinterPlugin>('PachaxBluetoothPrinter', {
  web: {
    async getState() {
      return { enabled: false, connected: false }
    },
    async listPairedDevices() {
      return { devices: [] }
    },
    async connect() {
      return { connected: false }
    },
    async disconnect() {
      return { disconnected: true }
    },
    async write() {
      return { bytesWritten: 0 }
    },
  },
})

export default PachaxBluetoothPrinter
