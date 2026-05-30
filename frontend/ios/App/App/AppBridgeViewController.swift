import UIKit
import Capacitor

class AppBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(StreakLocationPermissionPlugin())
    }
}
