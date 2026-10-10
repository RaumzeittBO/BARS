package net.pachax.bars.plugins;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "BarsUpdater")
public class BarsUpdaterPlugin extends Plugin {
    private static final String EXPECTED_PACKAGE = "net.pachax.bars";
    private static final String APK_PATH_PREFIX = "/updates/bars/apk/";
    private static final Set<String> TRUSTED_HOSTS = Set.of("bars-f911d.web.app", "bars-f911d.firebaseapp.com");
    private static final long MAX_APK_BYTES = 500L * 1024L * 1024L;
    private static final int BUFFER_SIZE = 64 * 1024;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean cancelled = new AtomicBoolean(false);
    private volatile File verifiedApk;

    @Override
    protected void handleOnDestroy() {
        cancelled.set(true);
        executor.shutdownNow();
        super.handleOnDestroy();
    }

    @PluginMethod
    public void getInstalledVersion(PluginCall call) {
        try {
            call.resolve(versionResult(getInstalledPackageInfo()));
        } catch (Exception error) {
            call.reject("No se pudo comprobar la versión instalada de BARS.", error);
        }
    }

    @PluginMethod
    public void checkInstallPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", canRequestPackageInstalls());
        call.resolve(result);
    }

    @PluginMethod
    public void requestInstallPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || canRequestPackageInstalls()) {
            JSObject result = new JSObject();
            result.put("opened", false);
            call.resolve(result);
            return;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("opened", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("No se pudo abrir el permiso para instalar la actualización.", error);
        }
    }

    @PluginMethod
    public void downloadUpdate(PluginCall call) {
        String rawUrl = call.getString("url", "");
        Double expectedSizeValue = call.getDouble("expectedSizeBytes");
        if (
            expectedSizeValue == null ||
            !Double.isFinite(expectedSizeValue) ||
            expectedSizeValue <= 0 ||
            expectedSizeValue > MAX_APK_BYTES ||
            expectedSizeValue != Math.rint(expectedSizeValue)
        ) {
            call.reject("El tamaño esperado del APK no es válido.", "INVALID_SIZE");
            return;
        }
        long expectedSize = expectedSizeValue.longValue();
        String expectedSha256 = call.getString("expectedSha256", "").trim().toLowerCase(Locale.ROOT);
        if (!expectedSha256.matches("^[a-f0-9]{64}$")) {
            call.reject("El hash SHA-256 no es válido.", "INVALID_HASH");
            return;
        }

        URL url;
        try {
            url = validateTrustedUrl(rawUrl);
        } catch (Exception error) {
            call.reject(error.getMessage(), "SECURITY_VIOLATION");
            return;
        }

        cancelled.set(false);
        executor.execute(() -> {
            File destination = null;
            HttpURLConnection connection = null;
            try {
                File dir = updateDirectory();
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("No se pudo crear el directorio de descargas.");
                destination = new File(dir, "bars-update-" + System.currentTimeMillis() + ".apk");

                connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(30000);
                connection.setInstanceFollowRedirects(false);
                connection.connect();

                int responseCode = connection.getResponseCode();
                if (responseCode != HttpURLConnection.HTTP_OK) {
                    throw new IllegalStateException("El servidor devolvió HTTP " + responseCode);
                }

                long contentLength = connection.getContentLengthLong();
                if (contentLength > 0 && contentLength != expectedSize) {
                    throw new SecurityException("El tamaño reportado por el servidor no coincide.");
                }

                try (InputStream in = new BufferedInputStream(connection.getInputStream(), BUFFER_SIZE);
                     BufferedOutputStream out = new BufferedOutputStream(new FileOutputStream(destination), BUFFER_SIZE)) {
                    byte[] buffer = new byte[BUFFER_SIZE];
                    long totalRead = 0;
                    int read;
                    long lastNotify = 0;

                    while ((read = in.read(buffer)) != -1) {
                        if (cancelled.get()) throw new InterruptedException("Descarga cancelada por el usuario.");
                        out.write(buffer, 0, read);
                        totalRead += read;
                        if (totalRead > expectedSize) throw new SecurityException("El archivo descargado superó el tamaño esperado.");

                        long now = System.currentTimeMillis();
                        if (now - lastNotify > 200 || totalRead == expectedSize) {
                            notifyProgress(totalRead, expectedSize);
                            lastNotify = now;
                        }
                    }
                    out.flush();
                }

                if (destination.length() != expectedSize) {
                    throw new SecurityException("El tamaño descargado no coincide con el manifiesto.");
                }

                // Verificar hash SHA-256
                String actualSha256 = sha256(destination);
                if (!actualSha256.equalsIgnoreCase(expectedSha256)) {
                    deleteQuietly(destination);
                    throw new SecurityException("El hash del APK no coincide con el manifiesto.");
                }

                // Verificar paquete del APK
                PackageInfo archiveInfo = getArchivePackageInfo(destination);
                if (archiveInfo == null || !EXPECTED_PACKAGE.equals(archiveInfo.packageName)
                    || !certificateSha256(archiveInfo).equals(certificateSha256(getInstalledPackageInfo()))) {
                    deleteQuietly(destination);
                    throw new SecurityException("El APK no corresponde al paquete oficial BARS.");
                }

                verifiedApk = destination;
                JSObject result = new JSObject();
                result.put("filePath", destination.getAbsolutePath());
                result.put("verified", true);
                call.resolve(result);

            } catch (Exception error) {
                if (destination != null) deleteQuietly(destination);
                verifiedApk = null;
                call.reject("La actualización fue rechazada: " + safeMessage(error), error);
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    @PluginMethod
    public void verifyApk(PluginCall call) {
        try {
            File apk = validatedUpdateFile(call.getString("filePath", ""));
            String expectedHash = call.getString("expectedSha256", "");
            Double expectedVersion = call.getDouble("expectedVersionCode");
            PackageInfo archiveInfo = getArchivePackageInfo(apk);
            if (expectedVersion == null || !Double.isFinite(expectedVersion)
                || expectedVersion != Math.rint(expectedVersion) || archiveInfo == null
                || !EXPECTED_PACKAGE.equals(archiveInfo.packageName)
                || !sha256(apk).equalsIgnoreCase(expectedHash)
                || versionCode(archiveInfo) != expectedVersion.longValue()
                || versionCode(archiveInfo) <= versionCode(getInstalledPackageInfo())
                || !certificateSha256(archiveInfo).equals(certificateSha256(getInstalledPackageInfo()))) {
                call.reject("La versión, integridad o firma del APK no coincide.");
                return;
            }
            verifiedApk = apk;
            JSObject result = new JSObject();
            result.put("verified", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("No se pudo verificar el APK.", error);
        }
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        try {
            File apk = validatedUpdateFile(call.getString("filePath", ""));
            if (verifiedApk == null || !verifiedApk.getCanonicalPath().equals(apk.getCanonicalPath())) {
                call.reject("El APK debe verificarse antes de instalarlo.");
                return;
            }
            if (!canRequestPackageInstalls()) {
                call.reject("Android todavía no autorizó la instalación desde esta aplicación.", "INSTALL_PERMISSION_REQUIRED");
                return;
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("opened", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("No se pudo abrir el instalador de Android.", error);
        }
    }

    @PluginMethod
    public void deleteUpdate(PluginCall call) {
        try {
            File apk = validatedUpdateFile(call.getString("filePath", ""));
            if (verifiedApk != null && verifiedApk.getCanonicalPath().equals(apk.getCanonicalPath())) verifiedApk = null;
            JSObject result = new JSObject();
            result.put("deleted", !apk.exists() || apk.delete());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("No se pudo eliminar el archivo de actualización.", error);
        }
    }

    private boolean canRequestPackageInstalls() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls();
    }

    private File updateDirectory() {
        File externalFiles = getContext().getExternalFilesDir(null);
        if (externalFiles == null) throw new IllegalStateException("Android no habilitó el almacenamiento privado.");
        return new File(externalFiles, "Download/updates");
    }

    private File validatedUpdateFile(String rawPath) throws Exception {
        File directory = updateDirectory().getCanonicalFile();
        File file = new File(rawPath).getCanonicalFile();
        if (!file.getParentFile().equals(directory) || !file.getName().endsWith(".apk") || !file.isFile()) {
            throw new SecurityException("La ruta del archivo no es válida.");
        }
        return file;
    }

    private URL validateTrustedUrl(String rawUrl) throws Exception {
        URL url = new URL(rawUrl);
        String host = url.getHost().toLowerCase(Locale.ROOT);
        boolean isTrusted = TRUSTED_HOSTS.contains(host);
        if (!"https".equalsIgnoreCase(url.getProtocol())) {
            throw new SecurityException("Se requiere HTTPS para la descarga de actualizaciones.");
        }
        if (!isTrusted || !url.getPath().startsWith(APK_PATH_PREFIX)
            || url.getUserInfo() != null || url.getQuery() != null || url.getRef() != null) {
            throw new SecurityException("Servidor de actualización no autorizado para BARS: " + host);
        }
        return url;
    }

    private void notifyProgress(long downloaded, long total) {
        JSObject progress = new JSObject();
        progress.put("bytesDownloaded", downloaded);
        progress.put("totalBytes", total);
        progress.put("percent", Math.min(100, Math.round(downloaded * 100.0 / total)));
        notifyListeners("downloadProgress", progress);
    }

    private PackageInfo getInstalledPackageInfo() throws PackageManager.NameNotFoundException {
        PackageManager manager = getContext().getPackageManager();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return manager.getPackageInfo(getContext().getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
        }
        return manager.getPackageInfo(getContext().getPackageName(), PackageManager.GET_SIGNATURES);
    }

    private PackageInfo getArchivePackageInfo(File apk) {
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        return getContext().getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), flags);
    }

    @SuppressWarnings("deprecation")
    private long versionCode(PackageInfo info) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
    }

    @SuppressWarnings("deprecation")
    private Signature firstSignature(PackageInfo info) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && info.signingInfo != null) {
            Signature[] signatures = info.signingInfo.hasMultipleSigners()
                ? info.signingInfo.getApkContentsSigners()
                : info.signingInfo.getSigningCertificateHistory();
            return signatures != null && signatures.length > 0 ? signatures[0] : null;
        }
        return info.signatures != null && info.signatures.length > 0 ? info.signatures[0] : null;
    }

    private String certificateSha256(PackageInfo info) throws Exception {
        Signature signature = firstSignature(info);
        if (signature == null) throw new SecurityException("El APK no contiene un certificado verificable.");
        return hex(MessageDigest.getInstance("SHA-256").digest(signature.toByteArray()));
    }

    private String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new BufferedInputStream(new FileInputStream(file), BUFFER_SIZE)) {
            byte[] buffer = new byte[BUFFER_SIZE];
            int count;
            while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
        }
        return hex(digest.digest());
    }

    private String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(String.format(Locale.ROOT, "%02x", value));
        return result.toString();
    }

    private JSObject versionResult(PackageInfo info) throws Exception {
        JSObject result = new JSObject();
        result.put("packageName", info.packageName);
        result.put("versionCode", versionCode(info));
        result.put("versionName", info.versionName == null ? "" : info.versionName);
        result.put("certificateSha256", certificateSha256(info));
        return result;
    }

    private String safeMessage(Exception error) {
        String message = error.getMessage();
        return message == null || message.isBlank() ? "error inesperado" : message;
    }

    private void deleteQuietly(File file) {
        try { if (file.exists()) file.delete(); } catch (Exception ignored) {}
    }
}
