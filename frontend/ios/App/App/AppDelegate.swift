import UIKit
import Capacitor
import GoogleSignIn

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        setupWebView()
    }

    private func setupWebView() {
        guard let rootVC = window?.rootViewController,
              let bridge = findBridgeViewController(in: rootVC),
              let scrollView = bridge.webView?.scrollView else { return }

        // Allow bounce at edges but NOT alwaysBounce —
        // alwaysBounceVertical made the whole WebView fly up on overscroll.
        // The inner <main> container handles its own elastic scroll via
        // -webkit-overflow-scrolling: touch in CSS.
        scrollView.bounces = true
        scrollView.alwaysBounceVertical = false

        // Native pull-to-refresh at the top
        if scrollView.refreshControl == nil {
            let rc = UIRefreshControl()
            rc.tintColor = UIColor.white
            rc.addTarget(self, action: #selector(handlePullToRefresh(_:)), for: .valueChanged)
            scrollView.refreshControl = rc
        }
    }

    @objc private func handlePullToRefresh(_ sender: UIRefreshControl) {
        guard let rootVC = window?.rootViewController,
              let bridge = findBridgeViewController(in: rootVC),
              let webView = bridge.webView else {
            sender.endRefreshing()
            return
        }
        // Dispatch a custom event so React can do an SWR soft-refresh
        webView.evaluateJavaScript(
            "window.dispatchEvent(new CustomEvent('app-pull-to-refresh'))"
        ) { _, _ in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                sender.endRefreshing()
            }
        }
    }

    private func findBridgeViewController(in vc: UIViewController) -> CAPBridgeViewController? {
        if let bridge = vc as? CAPBridgeViewController { return bridge }
        for child in vc.children {
            if let found = findBridgeViewController(in: child) { return found }
        }
        if let presented = vc.presentedViewController {
            return findBridgeViewController(in: presented)
        }
        return nil
    }

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        if GIDSignIn.sharedInstance.handle(url) {
            return true
        }
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
