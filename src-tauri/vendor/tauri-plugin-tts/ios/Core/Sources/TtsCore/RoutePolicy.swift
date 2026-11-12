import Foundation

/// What to do when the audio output changes under a sentence that is already speaking.
///
/// Headphones coming out land on the built-in speaker, and speech stays paused.
/// HomePod, Apple TV, and a newly chosen headset are the route the reader just picked.
public enum RoutePolicy {
    public static let builtInSpeaker = "Speaker"
    public static let builtInReceiver = "Receiver"

    /// True only when every remaining port is the phone's own speaker or receiver.
    public static func pausesWhenOutputFallsBack(_ portTypes: [String]) -> Bool {
        if portTypes.isEmpty { return true }
        return portTypes.allSatisfy { $0 == builtInSpeaker || $0 == builtInReceiver }
    }

    /// A pause the reader did not ask for, on a route that is still an external device,
    /// should continue. A phone-call interruption stays paused until the call ends.
    /// Two attempts is the cap, so a route that immediately pauses again cannot spin.
    public static func shouldContinueAfterPause(
        pausedByUser: Bool,
        interrupted: Bool,
        portTypes: [String],
        rebinds: Int
    ) -> Bool {
        if pausedByUser || interrupted || rebinds >= 2 { return false }
        return !pausesWhenOutputFallsBack(portTypes)
    }
}
