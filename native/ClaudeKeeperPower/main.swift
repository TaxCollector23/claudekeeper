import Foundation
import IOKit
import IOKit.pwr_mgt

// ClaudeKeeper power helper.
// Speaks a tiny line protocol on stdin/stdout so a long-lived Node parent can
// hold an IOKit power assertion without shelling out to `caffeinate`.
//
// Commands (one per line on stdin):
//   ACQUIRE <reason>   → creates kIOPMAssertPreventUserIdleSystemSleep (idempotent)
//   RELEASE            → releases the assertion if held
//   PING               → responds PONG
//
// Responses are single lines on stdout:
//   OK [detail]        → success
//   ERR <message>      → failure
//   PONG               → ping reply

var assertionID: IOPMAssertionID = 0
var held = false

func flush() {
    // Ensure the parent sees each response immediately.
    FileHandle.standardOutput.synchronizeFile()
}

func write(_ line: String) {
    print(line)
    // print() flushes on newline for line-buffered stdout, but when stdout is a
    // pipe it is block-buffered; force a flush so the Node parent is unblocked.
    fflush(stdout)
}

func acquire(reason: String) {
    if held {
        write("OK \(assertionID)")
        return
    }
    let name = "ClaudeKeeper: \(reason)" as CFString
    let type = kIOPMAssertPreventUserIdleSystemSleep as CFString
    let level = IOPMAssertionLevel(kIOPMAssertionLevelOn)
    let rc = IOPMAssertionCreateWithName(type, level, name, &assertionID)
    if rc == kIOReturnSuccess {
        held = true
        write("OK \(assertionID)")
    } else {
        write("ERR IOPMAssertionCreateWithName failed rc=\(rc)")
    }
}

func release() {
    if !held {
        write("OK")
        return
    }
    let rc = IOPMAssertionRelease(assertionID)
    held = false
    assertionID = 0
    if rc == kIOReturnSuccess {
        write("OK")
    } else {
        write("ERR IOPMAssertionRelease failed rc=\(rc)")
    }
}

// Clean up on termination so we do not leak assertions.
let cleanup: @convention(c) (Int32) -> Void = { _ in
    if held {
        _ = IOPMAssertionRelease(assertionID)
    }
    exit(0)
}
signal(SIGTERM, cleanup)
signal(SIGINT, cleanup)
signal(SIGHUP, cleanup)

while let line = readLine(strippingNewline: true) {
    let trimmed = line.trimmingCharacters(in: .whitespaces)
    if trimmed.isEmpty { continue }
    if trimmed == "PING" {
        write("PONG")
    } else if trimmed == "RELEASE" {
        release()
    } else if trimmed.hasPrefix("ACQUIRE") {
        let rest = trimmed.dropFirst("ACQUIRE".count).trimmingCharacters(in: .whitespaces)
        let reason = rest.isEmpty ? "active-session" : rest
        acquire(reason: reason)
    } else {
        write("ERR unknown command: \(trimmed)")
    }
}

// EOF on stdin — release and exit.
if held {
    _ = IOPMAssertionRelease(assertionID)
}
