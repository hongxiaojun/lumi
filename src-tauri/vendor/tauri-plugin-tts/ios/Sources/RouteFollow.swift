import AVFoundation
import TtsCore

extension TtsPlugin {
    /// HomePod or Apple TV paused the sentence on the way in. Continue on that route.
    func holdRouteIfExternal() {
        guard RoutePolicy.shouldContinueAfterPause(
            pausedByUser: pausedByUser,
            interrupted: wasInterrupted,
            portTypes: audio.outputPorts(),
            rebinds: routeRebinds
        ) else { return }
        routeRebinds += 1
        audio.wakeRoute()
        synthesizer.continueSpeaking()
    }

    func followHeldRoute() {
        guard !pausedByUser else { return }
        guard synthesizer.isSpeaking || synthesizer.isPaused else { return }
        audio.wakeRoute()
        guard synthesizer.isPaused else { return }
        holdRouteIfExternal()
    }
}
