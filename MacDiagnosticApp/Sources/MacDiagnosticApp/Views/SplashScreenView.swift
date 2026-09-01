import SwiftUI

struct SplashScreenView: View {
    @State private var logoScale: CGFloat = 0.3
    @State private var logoOpacity: Double = 0
    @State private var titleOpacity: Double = 0
    @State private var titleOffset: CGFloat = 30
    @State private var subtitleOpacity: Double = 0
    @State private var taglineOpacity: Double = 0
    @State private var glowOpacity: Double = 0.3
    @State private var dot1Opacity: Double = 0.3
    @State private var dot2Opacity: Double = 0.3
    @State private var dot3Opacity: Double = 0.3
    @State private var particleOffsets: [CGFloat] = Array(repeating: 0, count: 15)
    @State private var particleOpacities: [Double] = Array(repeating: 0, count: 15)

    var onComplete: () -> Void

    private let greenColor = Color(red: 0.20, green: 0.78, blue: 0.45)
    private let silverColor = Color(red: 0.82, green: 0.85, blue: 0.88)
    private let blueColor = Color(red: 0.16, green: 0.42, blue: 0.98)

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.06, green: 0.09, blue: 0.15),
                    Color(red: 0.10, green: 0.14, blue: 0.22),
                    Color(red: 0.06, green: 0.09, blue: 0.15)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            ForEach(0..<15, id: \.self) { i in
                Circle()
                    .fill(
                        [greenColor, silverColor, blueColor][i % 3].opacity(0.15)
                    )
                    .frame(width: particleSize(i), height: particleSize(i))
                    .offset(x: particleX(i), y: particleY(i))
                    .opacity(particleOpacities[i])
            }

            VStack(spacing: 0) {
                Spacer()

                ZStack {
                    ForEach(0..<3, id: \.self) { ring in
                        Circle()
                            .stroke(
                                [greenColor, silverColor, blueColor][ring].opacity(glowOpacity * (0.5 - Double(ring) * 0.15)),
                                lineWidth: 2
                            )
                            .frame(width: CGFloat(160 + ring * 40), height: CGFloat(160 + ring * 40))
                    }

                    Image(nsImage: NSApp.applicationIconImage)
                        .resizable()
                        .frame(width: 120, height: 120)
                        .clipShape(RoundedRectangle(cornerRadius: 24))
                        .scaleEffect(logoScale)
                        .opacity(logoOpacity)
                        .shadow(color: blueColor.opacity(glowOpacity), radius: 30, x: 0, y: 0)
                        .shadow(color: greenColor.opacity(glowOpacity * 0.5), radius: 50, x: 0, y: 0)
                }

                Spacer().frame(height: 40)

                Text("One Diagnose")
                    .font(.system(size: 42, weight: .bold, design: .rounded))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [greenColor, blueColor],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .tracking(1.5)
                    .opacity(titleOpacity)
                    .offset(y: titleOffset)

                Spacer().frame(height: 30)

                HStack(spacing: 8) {
                    Text("Complete Hardware")
                        .font(.system(size: 15, weight: .regular, design: .rounded))
                        .foregroundStyle(silverColor.opacity(0.6))
                    Text("&")
                        .font(.system(size: 15, weight: .bold, design: .rounded))
                        .foregroundStyle(greenColor.opacity(0.7))
                    Text("System Diagnostics")
                        .font(.system(size: 15, weight: .regular, design: .rounded))
                        .foregroundStyle(silverColor.opacity(0.6))
                }
                .padding(.horizontal, 28)
                .padding(.vertical, 12)
                .background(
                    RoundedRectangle(cornerRadius: 25)
                        .fill(Color.white.opacity(0.05))
                        .overlay(
                            RoundedRectangle(cornerRadius: 25)
                                .stroke(silverColor.opacity(0.15), lineWidth: 1)
                        )
                )
                .opacity(taglineOpacity)

                Spacer().frame(height: 60)

                HStack(spacing: 10) {
                    loadingDot(index: 0, color: greenColor, opacity: dot1Opacity)
                    loadingDot(index: 1, color: silverColor, opacity: dot2Opacity)
                    loadingDot(index: 2, color: blueColor, opacity: dot3Opacity)
                }

                Spacer()
            }
        }
        .onAppear {
            startAnimations()
        }
    }

    private func particleSize(_ i: Int) -> CGFloat {
        CGFloat(4 + (i % 5) * 2)
    }

    private func particleX(_ i: Int) -> CGFloat {
        CGFloat((i * 37) % 300 - 150)
    }

    private func particleY(_ i: Int) -> CGFloat {
        CGFloat((i * 53) % 400 - 200)
    }

    private func loadingDot(index: Int, color: Color, opacity: Double) -> some View {
        Circle()
            .fill(color)
            .frame(width: 8, height: 8)
            .opacity(opacity)
    }

    private func startAnimations() {
        withAnimation(.spring(response: 0.8, dampingFraction: 0.6).delay(0.2)) {
            logoScale = 1.0
            logoOpacity = 1.0
        }

        withAnimation(.easeInOut(duration: 2.0).repeatForever(autoreverses: true).delay(0.5)) {
            glowOpacity = 0.8
        }

        withAnimation(.easeOut(duration: 0.8).delay(0.8)) {
            titleOpacity = 1.0
            titleOffset = 0
        }

        withAnimation(.easeOut(duration: 0.6).delay(1.2)) {
            subtitleOpacity = 1.0
        }

        withAnimation(.easeOut(duration: 0.6).delay(1.5)) {
            taglineOpacity = 1.0
        }

        for i in 0..<15 {
            withAnimation(.easeInOut(duration: Double.random(in: 1.5...3.0)).repeatForever(autoreverses: true).delay(Double.random(in: 0.3...1.0))) {
                particleOpacities[i] = Double.random(in: 0.2...0.6)
                particleOffsets[i] = CGFloat.random(in: -10...10)
            }
        }

        withAnimation(.easeInOut(duration: 0.5).delay(1.8)) {
            dot1Opacity = 1.0
        }
        withAnimation(.easeInOut(duration: 0.5).delay(2.0)) {
            dot2Opacity = 1.0
        }
        withAnimation(.easeInOut(duration: 0.5).delay(2.2)) {
            dot3Opacity = 1.0
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 3.5) {
            withAnimation(.easeIn(duration: 0.5)) {
                logoOpacity = 0
                titleOpacity = 0
                subtitleOpacity = 0
                taglineOpacity = 0
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                onComplete()
            }
        }
    }
}
