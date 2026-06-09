import Foundation
import Capacitor
import WidgetKit

@objc(StreakWidgetPlugin)
public class StreakWidgetPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "StreakWidgetPlugin"
    public let jsName = "StreakWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "updateSnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearSnapshot", returnType: CAPPluginReturnPromise),
    ]

    @objc func updateSnapshot(_ call: CAPPluginCall) {
        let pendingToday = call.getInt("pendingToday") ?? 0
        let longestStreak = call.getInt("longestStreak") ?? 0
        StreakWidgetStore.save(pendingToday: pendingToday, longestStreak: longestStreak)
        WidgetCenter.shared.reloadTimelines(ofKind: StreakWidgetConstants.widgetKind)
        call.resolve()
    }

    @objc func clearSnapshot(_ call: CAPPluginCall) {
        StreakWidgetStore.clear()
        WidgetCenter.shared.reloadTimelines(ofKind: StreakWidgetConstants.widgetKind)
        call.resolve()
    }
}
