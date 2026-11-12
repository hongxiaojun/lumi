import XCTest
@testable import TtsCore

final class RoutePolicyTests: XCTestCase {
    func testAMissingRouteOrThePhoneSpeakerPauses() {
        XCTAssertTrue(RoutePolicy.pausesWhenOutputFallsBack([]))
        XCTAssertTrue(RoutePolicy.pausesWhenOutputFallsBack([RoutePolicy.builtInSpeaker]))
        XCTAssertTrue(RoutePolicy.pausesWhenOutputFallsBack([RoutePolicy.builtInReceiver]))
        XCTAssertTrue(
            RoutePolicy.pausesWhenOutputFallsBack([
                RoutePolicy.builtInSpeaker,
                RoutePolicy.builtInReceiver,
            ])
        )
    }

    func testAirPlayAndAHeadsetKeepSpeaking() {
        XCTAssertFalse(RoutePolicy.pausesWhenOutputFallsBack(["AirPlay"]))
        XCTAssertFalse(RoutePolicy.pausesWhenOutputFallsBack(["BluetoothA2DPOutput"]))
        XCTAssertFalse(
            RoutePolicy.pausesWhenOutputFallsBack([
                RoutePolicy.builtInSpeaker,
                "AirPlay",
            ])
        )
    }

    func testAnUnaskedPauseOnAirPlayContinuesOnce() {
        XCTAssertTrue(
            RoutePolicy.shouldContinueAfterPause(
                pausedByUser: false,
                interrupted: false,
                portTypes: ["AirPlay"],
                rebinds: 0
            )
        )
        XCTAssertFalse(
            RoutePolicy.shouldContinueAfterPause(
                pausedByUser: true,
                interrupted: false,
                portTypes: ["AirPlay"],
                rebinds: 0
            )
        )
        XCTAssertFalse(
            RoutePolicy.shouldContinueAfterPause(
                pausedByUser: false,
                interrupted: true,
                portTypes: ["AirPlay"],
                rebinds: 0
            )
        )
        XCTAssertFalse(
            RoutePolicy.shouldContinueAfterPause(
                pausedByUser: false,
                interrupted: false,
                portTypes: [RoutePolicy.builtInSpeaker],
                rebinds: 0
            )
        )
        XCTAssertFalse(
            RoutePolicy.shouldContinueAfterPause(
                pausedByUser: false,
                interrupted: false,
                portTypes: ["AirPlay"],
                rebinds: 2
            )
        )
    }
}
