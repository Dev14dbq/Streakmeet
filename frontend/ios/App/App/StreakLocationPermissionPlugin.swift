import Foundation
import Capacitor
import CoreLocation

@objc(StreakLocationPermissionPlugin)
public class StreakLocationPermissionPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "StreakLocationPermission"
    public let jsName = "StreakLocationPermission"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkAlways", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAlways", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openExternalUrl", returnType: CAPPluginReturnPromise),
    ]

    private let manager = CLLocationManager()
    private var pendingCall: CAPPluginCall?

    @objc func checkAlways(_ call: CAPPluginCall) {
        let status = authorizationStatus()
        call.resolve([
            "granted": status == .authorizedAlways,
            "foreground": status == .authorizedAlways || status == .authorizedWhenInUse,
            "background": status == .authorizedAlways,
        ])
    }

    @objc func requestAlways(_ call: CAPPluginCall) {
        pendingCall = call
        manager.delegate = self

        let status = authorizationStatus()
        switch status {
        case .authorizedAlways:
            call.resolve(["granted": true])
            pendingCall = nil
        case .notDetermined, .authorizedWhenInUse:
            manager.requestAlwaysAuthorization()
        default:
            call.reject("Location permission denied", "PERMISSION_DENIED")
            pendingCall = nil
        }
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        guard let url = URL(string: UIApplication.openSettingsURLString) else {
            call.reject("Cannot open settings")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url)
            call.resolve()
        }
    }

    @objc func openExternalUrl(_ call: CAPPluginCall) {
        guard let urlStr = call.getString("url"), let url = URL(string: urlStr) else {
            call.reject("Missing url")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { _ in
                call.resolve()
            }
        }
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        resolvePendingAuthorization()
    }

    public func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        resolvePendingAuthorization()
    }

    private func resolvePendingAuthorization() {
        guard let call = pendingCall else { return }

        let status = authorizationStatus()
        if status == .notDetermined { return }

        pendingCall = nil

        if status == .authorizedAlways {
            call.resolve(["granted": true])
        } else if status == .authorizedWhenInUse {
            call.reject("Need Always permission", "NOT_ALWAYS")
        } else {
            call.reject("Location permission denied", "PERMISSION_DENIED")
        }
    }

    private func authorizationStatus() -> CLAuthorizationStatus {
        if #available(iOS 14.0, *) {
            return manager.authorizationStatus
        }
        return CLLocationManager.authorizationStatus()
    }
}
