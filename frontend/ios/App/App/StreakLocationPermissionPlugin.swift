import Foundation
import Capacitor
import CoreLocation
import UIKit

@objc(StreakLocationPermissionPlugin)
public class StreakLocationPermissionPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {

    public let identifier = "StreakLocationPermissionPlugin"
    public let jsName = "StreakLocationPermission"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkAlways", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAlways", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openExternalUrl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showAlwaysPrompt", returnType: CAPPluginReturnPromise),
    ]

    private let manager = CLLocationManager()
    private var pendingCall: CAPPluginCall?

    @objc func checkAlways(_ call: CAPPluginCall) {
        let status = authorizationStatus()
        call.resolve([
            "granted":    status == .authorizedAlways,
            "foreground": status == .authorizedAlways || status == .authorizedWhenInUse,
            "background": status == .authorizedAlways,
            "denied":     status == .denied || status == .restricted,
        ])
    }

    @objc func requestAlways(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else {
                call.reject("Plugin deallocated", "INTERNAL")
                return
            }
            self.pendingCall = call
            self.manager.delegate = self

            let status = self.authorizationStatus()
            switch status {
            case .authorizedAlways:
                call.resolve(["granted": true])
                self.pendingCall = nil
            case .notDetermined, .authorizedWhenInUse:
                self.manager.requestAlwaysAuthorization()
            default:
                call.reject("Location permission denied", "PERMISSION_DENIED")
                self.pendingCall = nil
            }
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

    /// Native UIAlertController — JS passes localised strings.
    /// Returns { action: "continue" | "settings" | "cancel" }.
    /// When action == "settings" the Settings app is opened automatically.
    @objc func showAlwaysPrompt(_ call: CAPPluginCall) {
        let title       = call.getString("title")       ?? "Геолокация"
        let message     = call.getString("message")     ?? ""
        let cancelLabel = call.getString("cancelLabel") ?? "Не сейчас"
        let actionLabel = call.getString("actionLabel") ?? "Настройки"
        let actionType  = call.getString("actionType")  ?? "settings"

        DispatchQueue.main.async { [weak self] in
            guard let self else {
                call.reject("Plugin deallocated", "INTERNAL")
                return
            }

            let alert = UIAlertController(
                title: title,
                message: message,
                preferredStyle: .alert
            )

            alert.addAction(UIAlertAction(title: cancelLabel, style: .cancel) { _ in
                call.resolve(["action": "cancel"])
            })

            alert.addAction(UIAlertAction(title: actionLabel, style: .default) { _ in
                if actionType == "settings" {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                }
                call.resolve(["action": actionType])
            })

            guard let presenter = self.topViewController() else {
                call.reject("No view controller to present alert", "UNAVAILABLE")
                return
            }
            presenter.present(alert, animated: true)
        }
    }

    // MARK: - CLLocationManagerDelegate

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
        manager.authorizationStatus
    }

    private func topViewController() -> UIViewController? {
        var root = bridge?.viewController
        if root == nil {
            root = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows)
                .first(where: \.isKeyWindow)?
                .rootViewController
        }
        return Self.topmostViewController(from: root)
    }

    private static func topmostViewController(from root: UIViewController?) -> UIViewController? {
        if let presented = root?.presentedViewController {
            return topmostViewController(from: presented)
        }
        if let nav = root as? UINavigationController {
            return topmostViewController(from: nav.visibleViewController)
        }
        if let tab = root as? UITabBarController {
            return topmostViewController(from: tab.selectedViewController)
        }
        return root
    }
}
