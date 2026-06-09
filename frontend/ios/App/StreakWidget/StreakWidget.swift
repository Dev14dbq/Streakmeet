import SwiftUI
import WidgetKit

private enum StreakWidgetPalette {
    static let brand = Color(red: 1, green: 0.102, blue: 0.31)
    static let ok = Color(red: 0.2, green: 0.78, blue: 0.45)
}

struct StreakWidgetEntry: TimelineEntry {
    let date: Date
    let pendingToday: Int
    let longestStreak: Int
}

struct StreakWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> StreakWidgetEntry {
        StreakWidgetEntry(date: Date(), pendingToday: 2, longestStreak: 47)
    }

    func getSnapshot(in context: Context, completion: @escaping (StreakWidgetEntry) -> Void) {
        completion(makeEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<StreakWidgetEntry>) -> Void) {
        let entry = makeEntry()
        let nextRefresh = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date().addingTimeInterval(1800)
        completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
    }

    private func makeEntry() -> StreakWidgetEntry {
        let snapshot = StreakWidgetStore.load()
        return StreakWidgetEntry(
            date: Date(),
            pendingToday: snapshot.pendingToday,
            longestStreak: snapshot.longestStreak
        )
    }
}

struct StreakWidgetCircularView: View {
    let entry: StreakWidgetEntry

    private var isUrgent: Bool { entry.pendingToday > 0 }

    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 1) {
                Image(systemName: isUrgent ? "flame.fill" : "checkmark")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(isUrgent ? StreakWidgetPalette.brand : StreakWidgetPalette.ok)
                Text("\(entry.pendingToday)")
                    .font(.system(size: 18, weight: .heavy, design: .rounded))
                    .minimumScaleFactor(0.7)
                    .foregroundStyle(.primary)
            }
        }
        .widgetURL(URL(string: "streakmeet://home"))
    }
}

struct StreakWidget: Widget {
    let kind: String = StreakWidgetConstants.widgetKind

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: StreakWidgetProvider()) { entry in
            StreakWidgetCircularView(entry: entry)
        }
        .configurationDisplayName("Горящие серии")
        .description("Сколько серий ждут встречи сегодня.")
        .supportedFamilies([.accessoryCircular])
    }
}
