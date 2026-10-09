import { Capacitor } from '@capacitor/core'
import BarsUpdater, { type InstalledAppVersion } from '../../plugins/barsUpdaterPlugin'

export interface BarsUpdateManifest {
  packageName: string
  versionName: string
  versionCode: number
  minSupportedVersionCode: number
  isMandatory: boolean
  releaseDate: string
  apkUrl: string
  apkSizeBytes: number
  apkSha256: string
  releaseNotes: string
}

export interface UpdateCheckResult {
  hasUpdate: boolean
  isMandatory: boolean
  installedVersion: InstalledAppVersion
  availableManifest?: BarsUpdateManifest
  message: string
}

const DEFAULT_MANIFEST_URL =
  import.meta.env.VITE_UPDATER_MANIFEST_URL ||
  'https://bars-beta.vercel.app/updates/bars/update.json'

class BarsUpdateService {
  private isChecking = false

  isAndroid(): boolean {
    return Capacitor.getPlatform() === 'android'
  }

  async getInstalledVersion(): Promise<InstalledAppVersion> {
    try {
      return await BarsUpdater.getInstalledVersion()
    } catch {
      return { packageName: 'net.pachax.bars', versionName: '1.0.0-web', versionCode: 1 }
    }
  }

  async checkForUpdates(manifestUrl: string = DEFAULT_MANIFEST_URL): Promise<UpdateCheckResult> {
    const installed = await this.getInstalledVersion()

    if (!this.isAndroid()) {
      return {
        hasUpdate: false,
        isMandatory: false,
        installedVersion: installed,
        message: 'Estás ejecutando la versión web de BARS (siempre actualizada).',
      }
    }

    if (this.isChecking) {
      return {
        hasUpdate: false,
        isMandatory: false,
        installedVersion: installed,
        message: 'Ya hay una comprobación de actualización en curso.',
      }
    }

    this.isChecking = true
    try {
      const response = await fetch(manifestUrl, { cache: 'no-store' })
      if (!response.ok) {
        throw new Error(`El servidor respondió ${response.status}`)
      }

      const manifest: BarsUpdateManifest = await response.json()

      // Validar paquete
      if (manifest.packageName !== 'net.pachax.bars') {
        throw new Error('El manifiesto no corresponde al paquete autorizado de BARS (net.pachax.bars).')
      }

      const hasUpdate = manifest.versionCode > installed.versionCode
      const isMandatory = Boolean(manifest.isMandatory || manifest.minSupportedVersionCode > installed.versionCode)

      return {
        hasUpdate,
        isMandatory,
        installedVersion: installed,
        availableManifest: hasUpdate ? manifest : undefined,
        message: hasUpdate
          ? `Nueva versión ${manifest.versionName} disponible (actual: ${installed.versionName}).`
          : 'La aplicación BARS ya está actualizada.',
      }
    } catch (err: any) {
      return {
        hasUpdate: false,
        isMandatory: false,
        installedVersion: installed,
        message: `No se pudieron consultar actualizaciones: ${err?.message || 'Error de conexión'}.`,
      }
    } finally {
      this.isChecking = false
    }
  }

  async startDownloadAndInstall(
    manifest: BarsUpdateManifest,
    onProgress?: (percent: number) => void
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.isAndroid()) {
      return { success: false, error: 'La instalación automática de APK solo funciona en Android.' }
    }

    try {
      // 1. Verificar permiso de instalación de paquetes desconocidos
      const perm = await BarsUpdater.checkInstallPermission()
      if (!perm.granted) {
        await BarsUpdater.requestInstallPermission()
      }

      // 2. Descargar actualización
      onProgress?.(10)
      const downloadRes = await BarsUpdater.downloadUpdate({
        url: manifest.apkUrl,
        expectedSizeBytes: manifest.apkSizeBytes,
      })
      onProgress?.(70)

      // 3. Verificar APK descargado (integridad hash y versión)
      const verifyRes = await BarsUpdater.verifyApk({
        filePath: downloadRes.filePath,
        expectedSha256: manifest.apkSha256,
        expectedVersionCode: manifest.versionCode,
      })

      if (!verifyRes.verified) {
        throw new Error('La verificación de integridad de la APK descargada falló.')
      }

      onProgress?.(90)

      // 4. Iniciar instalador del sistema
      const installRes = await BarsUpdater.installApk({ filePath: downloadRes.filePath })
      onProgress?.(100)

      return { success: installRes.launched }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error al descargar o instalar la actualización.' }
    }
  }
}

export const barsUpdateService = new BarsUpdateService()
