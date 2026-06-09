import Foundation

enum StreakWidgetConstants {
    static let appGroupId = "group.com.streakmeet.app"
    static let snapshotKey = "streakWidgetSnapshot"
    static let widgetKind = "StreakWidget"
}

struct StreakWidgetSnapshot: Codable {
    let pendingToday: Int
    let longestStreak: Int
    let updatedAt: Date

    static let empty = StreakWidgetSnapshot(pendingToday: 0, longestStreak: 0, updatedAt: .distantPast)
}

enum StreakWidgetStore {
    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: StreakWidgetConstants.appGroupId)
    }

    static func load() -> StreakWidgetSnapshot {
        guard
            let data = defaults?.data(forKey: StreakWidgetConstants.snapshotKey),
            let snapshot = try? JSONDecoder().decode(StreakWidgetSnapshot.self, from: data)
        else {
            return .empty
        }
        return snapshot
    }

    static func save(pendingToday: Int, longestStreak: Int) {
        let snapshot = StreakWidgetSnapshot(
            pendingToday: max(0, pendingToday),
            longestStreak: max(0, longestStreak),
            updatedAt: Date()
        )
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults?.set(data, forKey: StreakWidgetConstants.snapshotKey)
    }

    static func clear() {
        defaults?.removeObject(forKey: StreakWidgetConstants.snapshotKey)
    }
}
