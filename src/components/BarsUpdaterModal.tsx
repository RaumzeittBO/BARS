import {
  AlertCircle,
  CheckCircle2,
  Download,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { barsUpdateService, type BarsUpdateManifest, type UpdateCheckResult } from '../services/updater/barsUpdateService'
import type { InstalledAppVersion } from '../plugins/barsUpdaterPlugin'
import { Button } from './ui/Button'
import { Panel } from './ui/Panel'

export function BarsUpdaterModal({
  isOpen,
  onClose,
  initialManifest,
}: {
  isOpen: boolean
  onClose: () => void
  initialManifest?: BarsUpdateManifest
}) {
  const [isChecking, setIsChecking] = useState(false)
  const [installedVersion, setInstalledVersion] = useState<InstalledAppVersion | null>(null)
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const check = async () => {
    setIsChecking(true)
    setErrorMessage(null)
    setSuccessMessage(null)
    try {
      const res = await barsUpdateService.checkForUpdates()
      setUpdateResult(res)
      setInstalledVersion(res.installedVersion)
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error al comprobar actualizaciones.')
    } finally {
      setIsChecking(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      barsUpdateService.getInstalledVersion().then(setInstalledVersion)
      if (initialManifest) {
        setUpdateResult({
          hasUpdate: true,
          isMandatory: initialManifest.isMandatory,
          installedVersion: { packageName: 'net.pachax.bars', versionName: '1.0.0', versionCode: 1 },
          availableManifest: initialManifest,
          message: `Nueva versión ${initialManifest.versionName} disponible.`,
        })
      } else {
        check()
      }
    }
  }, [isOpen, initialManifest])

  if (!isOpen) return null

  const handleStartUpdate = async () => {
    const manifest = updateResult?.availableManifest || initialManifest
    if (!manifest) return

    setErrorMessage(null)
    setDownloadProgress(0)

    const res = await barsUpdateService.startDownloadAndInstall(manifest, (p) => {
      setDownloadProgress(p)
    })

    if (!res.success) {
      setErrorMessage(res.error || 'Error al descargar o verificar la actualización.')
      setDownloadProgress(null)
    } else {
      setSuccessMessage('Descarga completada e instalador iniciado.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
      <Panel className="w-full max-w-md p-6 border-[#333333] bg-[#141414] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#262626] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FF6A00]/15 text-[#FF6A00]">
              <Sparkles size={18} />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Actualizaciones BARS</h3>
              <p className="text-[11px] text-[#888888]">
                {installedVersion ? `Versión instalada: v${installedVersion.versionName} (${installedVersion.versionCode})` : 'Comprobando...'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#777777] hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {isChecking ? (
            <div className="py-8 text-center text-xs text-[#9E9E9E] space-y-2">
              <LoaderCircle size={28} className="animate-spin text-[#FF6A00] mx-auto" />
              <p>Consultando servidor de actualizaciones BARS...</p>
            </div>
          ) : updateResult?.hasUpdate ? (
            <div className="space-y-4">
              <div className="rounded-2xl bg-[#1A1A1A] p-4 border border-[#FF6A00]/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#FF6A00]">
                    Nueva versión {updateResult.availableManifest?.versionName}
                  </span>
                  {updateResult.isMandatory && (
                    <span className="rounded-full bg-rose-950/60 border border-rose-800 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                      Obligatoria
                    </span>
                  )}
                </div>
                <p className="text-xs text-white leading-relaxed">
                  {updateResult.availableManifest?.releaseNotes || 'Mejoras y correcciones generales en BARS.'}
                </p>
                <div className="pt-2 text-[10px] text-[#777777] flex justify-between border-t border-[#262626]">
                  <span>Paquete: {updateResult.availableManifest?.packageName}</span>
                  <span>
                    Tamaño: {((updateResult.availableManifest?.apkSizeBytes || 0) / (1024 * 1024)).toFixed(1)} MB
                  </span>
                </div>
              </div>

              {downloadProgress !== null ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-[#9E9E9E]">
                    <span>Descargando e instalando...</span>
                    <span>{downloadProgress}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-[#222222] overflow-hidden">
                    <div
                      className="h-full bg-[#FF6A00] transition-all duration-300"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                </div>
              ) : null}

              {errorMessage && (
                <div className="flex items-center gap-2 rounded-xl bg-rose-950/40 border border-rose-800 p-3 text-xs text-rose-300">
                  <AlertCircle size={16} />
                  {errorMessage}
                </div>
              )}

              {successMessage && (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-950/40 border border-emerald-800 p-3 text-xs text-emerald-300">
                  <CheckCircle2 size={16} />
                  {successMessage}
                </div>
              )}

              <Button
                fullWidth
                size="lg"
                disabled={downloadProgress !== null}
                onClick={handleStartUpdate}
                className="gap-2"
              >
                <Download size={18} />
                Descargar e Instalar Actualización
              </Button>
            </div>
          ) : (
            <div className="py-6 text-center text-xs space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-950/40 border border-emerald-800/50 text-emerald-400 mx-auto">
                <CheckCircle2 size={24} />
              </div>
              <div>
                <p className="font-bold text-white text-sm">Tu aplicación está al día</p>
                <p className="text-[#888888] mt-1">{updateResult?.message || 'No hay actualizaciones pendientes.'}</p>
              </div>
              <Button size="sm" tone="secondary" onClick={check} className="mx-auto gap-2">
                <RefreshCw size={14} />
                Volver a comprobar
              </Button>
            </div>
          )}
        </div>
      </Panel>
    </div>
  )
}
