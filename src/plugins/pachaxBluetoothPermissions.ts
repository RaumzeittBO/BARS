import { registerPlugin } from '@capacitor/core'

export type BluetoothPermissionValue = 'granted' | 'denied' | 'permanentlyDenied' | 'notRequired'

export interface PachaxBluetoothPermissionsStatus {
  apiLevel: number
  bluetoothConnect: BluetoothPermissionValue
  bluetoothScan: BluetoothPermissionValue
}

export interface PachaxBluetoothPermissionsPlugin {
  checkPermissions(): Promise<PachaxBluetoothPermissionsStatus>
  requestConnectPermission(): Promise<PachaxBluetoothPermissionsStatus>
  openAppSettings(): Promise<{ opened: boolean }>
}

const PachaxBluetoothPermissions = registerPlugin<PachaxBluetoothPermissionsPlugin>('PachaxBluetoothPermissions', {
  web: {
    async checkPermissions(): Promise<PachaxBluetoothPermissionsStatus> {
      return { apiLevel: 34, bluetoothConnect: 'notRequired', bluetoothScan: 'notRequired' }
    },
    async requestConnectPermission(): Promise<PachaxBluetoothPermissionsStatus> {
      return { apiLevel: 34, bluetoothConnect: 'notRequired', bluetoothScan: 'notRequired' }
    },
    async openAppSettings(): Promise<{ opened: boolean }> {
      return { opened: true }
    },
  },
})

export default PachaxBluetoothPermissions
