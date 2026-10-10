import { registerPlugin } from '@capacitor/core'

export interface InstalledAppVersion {
  packageName: string
  versionName: string
  versionCode: number
}

export interface BarsUpdaterPluginInterface {
  getInstalledVersion(): Promise<InstalledAppVersion>
  checkInstallPermission(): Promise<{ granted: boolean }>
  requestInstallPermission(): Promise<{ opened: boolean }>
  downloadUpdate(options: { url: string; expectedSizeBytes: number; expectedSha256: string }): Promise<{ filePath: string; verified: boolean }>
  cancelDownload(): Promise<{ cancelled: boolean }>
  verifyApk(options: { filePath: string; expectedSha256: string; expectedVersionCode: number }): Promise<{ verified: boolean }>
  installApk(options: { filePath: string }): Promise<{ opened: boolean }>
}

const BarsUpdater = registerPlugin<BarsUpdaterPluginInterface>('BarsUpdater', {
  web: {
    async getInstalledVersion() {
      return { packageName: 'net.pachax.bars', versionName: '1.0.0-web', versionCode: 1 }
    },
    async checkInstallPermission() {
      return { granted: false }
    },
    async requestInstallPermission() {
      return { opened: false }
    },
    async downloadUpdate() {
      throw new Error('Las actualizaciones nativas solo están disponibles en la aplicación Android.')
    },
    async cancelDownload() {
      return { cancelled: true }
    },
    async verifyApk() {
      return { verified: false }
    },
    async installApk() {
      return { opened: false }
    },
  },
})

export default BarsUpdater
