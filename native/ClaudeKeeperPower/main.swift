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
    // Private, unsupported Apple SPI (same trick Fermata/StillOn use, needs no
    // admin): set "AppliesOnLidClose" at CREATION time so the assertion survives
    // the lid closing. We then read the property back to know if the OS honored it
    // (Apple restricts it on some newer builds).
    let props: [String: Any] = [
        kIOPMAssertionTypeKey as String: kIOPMAssertPreventUserIdleSystemSleep as String,
        kIOPMAssertionNameKey as String: "ClaudeKeeper: \(reason)",
        kIOPMAssertionLevelKey as String: kIOPMAssertionLevelOn,
        "AppliesOnLidClose": kCFBooleanTrue as Any,
    ]
    var rc = IOPMAssertionCreateWithProperties(props as CFDictionary, &assertionID)
    if rc != kIOReturnSuccess {
        // Fall back to the plain assertion (idle-sleep only) so we still do something.
        let type = kIOPMAssertPreventUserIdleSystemSleep as CFString
        rc = IOPMAssertionCreateWithName(type, IOPMAssertionLevel(kIOPMAssertionLevelOn),
                                         "ClaudeKeeper: \(reason)" as CFString, &assertionID)
    }
    if rc == kIOReturnSuccess {
        held = true
        // Also try SetProperty (belt and suspenders) and then verify.
        _ = IOPMAssertionSetProperty(assertionID, "AppliesOnLidClose" as CFString, kCFBooleanTrue)
        var lidOK = false
        if let copied = IOPMAssertionCopyProperties(assertionID)?.takeRetainedValue()
            as? [String: Any] {
            if let v = copied["AppliesOnLidClose"] as? Bool { lidOK = v }
            else if let n = copied["AppliesOnLidClose"] as? Int { lidOK = n != 0 }
        }
        write("OK \(assertionID) lidclose=\(lidOK ? 1 : 0)")
    } else {
        write("ERR IOPMAssertionCreate failed rc=\(rc)")
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
