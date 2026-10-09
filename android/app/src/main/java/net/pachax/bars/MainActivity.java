package net.pachax.bars;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import net.pachax.bars.plugins.BarsUpdaterPlugin;
import net.pachax.bars.plugins.PachaxBluetoothPermissionsPlugin;
import net.pachax.bars.plugins.PachaxBluetoothPrinterPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PachaxBluetoothPermissionsPlugin.class);
        registerPlugin(PachaxBluetoothPrinterPlugin.class);
        registerPlugin(BarsUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
