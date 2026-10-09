package net.pachax.bars.plugins;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "PachaxBluetoothPermissions",
    permissions = {
        @Permission(
            alias = "bluetoothConnect",
            strings = { Manifest.permission.BLUETOOTH_CONNECT }
        ),
        @Permission(
            alias = "bluetoothScan",
            strings = { Manifest.permission.BLUETOOTH_SCAN }
        )
    }
)
public class PachaxBluetoothPermissionsPlugin extends Plugin {

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject ret = new JSObject();
        int apiLevel = Build.VERSION.SDK_INT;
        ret.put("apiLevel", apiLevel);

        if (apiLevel < 31) {
            ret.put("bluetoothConnect", "notRequired");
            ret.put("bluetoothScan", "notRequired");
            call.resolve(ret);
            return;
        }

        ret.put("bluetoothConnect", getPermissionStatusString(Manifest.permission.BLUETOOTH_CONNECT));
        ret.put("bluetoothScan", getPermissionStatusString(Manifest.permission.BLUETOOTH_SCAN));
        call.resolve(ret);
    }

    private String getPermissionStatusString(String permission) {
        if (ContextCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED) {
            return "granted";
        }
        if (getActivity() != null && ActivityCompat.shouldShowRequestPermissionRationale(getActivity(), permission)) {
            return "denied";
        }
        return "permanentlyDenied";
    }

    @PluginMethod
    public void requestConnectPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < 31) {
            JSObject ret = new JSObject();
            ret.put("bluetoothConnect", "notRequired");
            ret.put("apiLevel", Build.VERSION.SDK_INT);
            call.resolve(ret);
            return;
        }

        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED) {
            JSObject ret = new JSObject();
            ret.put("bluetoothConnect", "granted");
            ret.put("apiLevel", Build.VERSION.SDK_INT);
            call.resolve(ret);
            return;
        }

        requestPermissionForAlias("bluetoothConnect", call, "onConnectPermissionResult");
    }

    @PermissionCallback
    private void onConnectPermissionResult(PluginCall call) {
        checkPermissions(call);
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            Uri uri = Uri.fromParts("package", getContext().getPackageName(), null);
            intent.setData(uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);

            JSObject ret = new JSObject();
            ret.put("opened", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("No se pudo abrir la configuración de la aplicación.", e);
        }
    }
}
