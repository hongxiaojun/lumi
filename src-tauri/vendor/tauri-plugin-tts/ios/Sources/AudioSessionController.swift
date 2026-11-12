import AVFoundation
import TtsCore
import UIKit

/// Owns the audio session and reports the system events that interrupt speech.
///
/// The controller never decides what happens to the synthesizer; it only says what the
/// system did, so the pause-versus-stop policy lives in one place in the plugin.
final class AudioSessionController {

    struct Events {
        /// A call or another app took the session.
        let interruptionBegan: () -> Void
        /// The interruption ended. `shouldResume` is the system's advice.
        let interruptionEnded: (_ shouldResume: Bool) -> Void
        /// Headphones were unplugged and the only output left is the phone speaker.
        let outputLost: () -> Void
        /// The route changed onto a device the reader just picked, such as HomePod or Apple TV.
        let routeHeld: () -> Void
        let enteredBackground: () -> Void
        let willTerminate: () -> Void
    }

    private let events: Events
    private var keeper: AVAudioPlayer?
    private var keeperRest: DispatchWorkItem?

    init(events: Events) {
        self.events = events
        observe()
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    /// Configures and activates the session.
    ///
    /// - Returns: nil on success, or a reason the session is unusable. Speaking into a
    ///   session that never activated produces silence with no error, so the caller reports
    ///   this rather than continuing.
    @discardableResult
    func activate() -> String? {
        do {
            let session = AVAudioSession.sharedInstance()
            // Long-form playback is what sends spoken audio to an AirPlay receiver.
            // spokenAudio can refuse that policy on some systems, so the old category remains.
            do {
                try session.setCategory(
                    .playback,
                    mode: .spokenAudio,
                    policy: .longFormAudio,
                    options: [.duckOthers]
                )
            } catch {
                try session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
            }
            try session.setActive(true)
            return nil
        } catch {
            return "Audio session unavailable: \(error.localizedDescription)"
        }
    }

    /// A near-silent loop keeps the AirPlay receiver awake so the first words of a sentence are not dropped.
    func wakeRoute() {
        keeperRest?.cancel()
        keeperRest = nil
        if keeper?.isPlaying == true { return }
        guard let player = try? AVAudioPlayer(data: RouteKeeperWav.make()) else { return }
        player.numberOfLoops = -1
        player.volume = 1
        player.prepareToPlay()
        player.play()
        keeper = player
    }

    /// Stop the loop soon after the sentence ends, unless another sentence starts.
    func restRoute() {
        keeperRest?.cancel()
        let work = DispatchWorkItem { [weak self] in
            self?.keeper?.stop()
            self?.keeper = nil
        }
        keeperRest = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5, execute: work)
    }

    func stopRoute() {
        keeperRest?.cancel()
        keeperRest = nil
        keeper?.stop()
        keeper = nil
    }

    func outputPorts() -> [String] {
        AVAudioSession.sharedInstance().currentRoute.outputs.map { $0.portType.rawValue }
    }

    func reactivate() throws {
        try AVAudioSession.sharedInstance().setActive(true)
    }

    func deactivate() {
        stopRoute()
        try? AVAudioSession.sharedInstance()
            .setActive(false, options: .notifyOthersOnDeactivation)
    }

    /// Whether the app is allowed to keep playing once suspended. Without this entitlement
    /// speech stops on lock with no event, which looks like a plugin bug.
    var hasBackgroundAudioEntitlement: Bool {
        let modes = Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String]
        return modes?.contains("audio") == true
    }

    private func observe() {
        let center = NotificationCenter.default

        center.addObserver(
            self,
            selector: #selector(handleInterruption),
            name: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance()
        )
        center.addObserver(
            self,
            selector: #selector(handleRouteChange),
            name: AVAudioSession.routeChangeNotification,
            object: AVAudioSession.sharedInstance()
        )
        center.addObserver(
            self,
            selector: #selector(handleDidEnterBackground),
            name: UIApplication.didEnterBackgroundNotification,
            object: nil
        )
        center.addObserver(
            self,
            selector: #selector(handleWillTerminate),
            name: UIApplication.willTerminateNotification,
            object: nil
        )
    }

    @objc private func handleInterruption(_ notification: Notification) {
        guard
            let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
            let type = AVAudioSession.InterruptionType(rawValue: raw)
        else { return }

        switch type {
        case .began:
            events.interruptionBegan()
        case .ended:
            let raw = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            let options = AVAudioSession.InterruptionOptions(rawValue: raw)
            let resume = options.contains(.shouldResume)
                || !RoutePolicy.pausesWhenOutputFallsBack(outputPorts())
            events.interruptionEnded(resume)
        @unknown default:
            break
        }
    }

    @objc private func handleRouteChange(_ notification: Notification) {
        guard
            let raw = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
            let reason = AVAudioSession.RouteChangeReason(rawValue: raw)
        else { return }

        switch reason {
        case .oldDeviceUnavailable:
            if RoutePolicy.pausesWhenOutputFallsBack(outputPorts()) {
                events.outputLost()
            } else {
                events.routeHeld()
            }
        case .newDeviceAvailable, .override, .routeConfigurationChange, .categoryChange:
            events.routeHeld()
        default:
            break
        }
    }

    @objc private func handleDidEnterBackground() {
        events.enteredBackground()
    }

    @objc private func handleWillTerminate() {
        events.willTerminate()
    }
}

/// 0.2 s of near-silence. A buffer of pure zeros can be dropped before it wakes an AirPlay receiver.
private enum RouteKeeperWav {
    static func make() -> Data {
        let sampleRate = 8_000
        let frames = 1_600
        let dataSize = frames * 2
        var data = Data(capacity: 44 + dataSize)

        func ascii(_ text: String) {
            data.append(contentsOf: text.utf8)
        }
        func u32(_ value: UInt32) {
            var little = value.littleEndian
            withUnsafeBytes(of: &little) { data.append(contentsOf: $0) }
        }
        func u16(_ value: UInt16) {
            var little = value.littleEndian
            withUnsafeBytes(of: &little) { data.append(contentsOf: $0) }
        }

        ascii("RIFF")
        u32(UInt32(36 + dataSize))
        ascii("WAVE")
        ascii("fmt ")
        u32(16)
        u16(1)
        u16(1)
        u32(UInt32(sampleRate))
        u32(UInt32(sampleRate * 2))
        u16(2)
        u16(16)
        ascii("data")
        u32(UInt32(dataSize))
        for index in 0..<frames {
            var sample = Int16(index % 40 == 0 ? 2 : 0).littleEndian
            withUnsafeBytes(of: &sample) { data.append(contentsOf: $0) }
        }
        return data
    }
}
