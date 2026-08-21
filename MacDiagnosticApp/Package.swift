// swift-tools-version:6.0
import PackageDescription

let package = Package(
    name: "MacDiagnosticApp",
    defaultLocalization: "en",
    platforms: [
        .macOS(.v15)
    ],
    products: [
        .library(name: "MacDiagnosticKit", targets: ["MacDiagnosticKit"]),
        .executable(name: "MacDiagnosticApp", targets: ["MacDiagnosticApp"]),
        .executable(name: "macdiagnostic-selftest", targets: ["MacDiagnosticSelftest"])
    ],
    targets: [
        .target(
            name: "MacDiagnosticKit",
            path: "Sources/MacDiagnosticKit"
        ),
        .executableTarget(
            name: "MacDiagnosticApp",
            dependencies: ["MacDiagnosticKit"],
            path: "Sources/MacDiagnosticApp"
        ),
        .executableTarget(
            name: "MacDiagnosticSelftest",
            dependencies: ["MacDiagnosticKit"],
            path: "Sources/MacDiagnosticSelftest"
        ),
        .testTarget(
            name: "MacDiagnosticKitTests",
            dependencies: ["MacDiagnosticKit"],
            path: "Tests/MacDiagnosticKitTests"
        )
    ]
)
