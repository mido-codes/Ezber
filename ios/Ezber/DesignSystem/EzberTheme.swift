import CoreText
import SwiftUI
import UIKit

// MARK: - Tokens

/// The Ezber design language, ported from the component kit's token layer
/// (`data/ezber-design-system/app/globals.css`, tabulated in
/// `data/ezber-design-review/report.md` §2). This file is the single source of
/// truth for colour, type, spacing, radius and shadow values in the app; retune
/// the kit and this file together.
enum EzberColor {

    // Colour tokens, light → dark (exact hexes from the compiled kit CSS).

    static let background = ezberDynamic(0xEDEBE5, 0x0F0D08)
    static let foreground = ezberDynamic(0x211F19, 0xEAE8E0)
    static let card = ezberDynamic(0xF8F7F2, 0x191711)
    static let cardForeground = ezberDynamic(0x211F19, 0xEAE8E0)
    static let primary = ezberDynamic(0x344F3D, 0x83B28C)
    static let primaryForeground = ezberDynamic(0xF7F5EF, 0x071009)
    static let secondary = ezberDynamic(0xDBE0D6, 0x242821)
    static let secondaryForeground = ezberDynamic(0x1F261D, 0xEAE8E0)
    static let muted = ezberDynamic(0xE2DFDA, 0x26241E)
    static let mutedForeground = ezberDynamic(0x66635A, 0x9B9890)

    /// Muted honey. Reserved for the active-verse cue — never a CTA, progress
    /// fill or tint. The dark value is the report's AA fix (`#876D40` → 4.24:1;
    /// `#7E6438` → 4.83:1 with the cream token unchanged).
    static let accent = ezberDynamic(0xE0CFAC, 0x7E6438)
    static let accentForeground = ezberDynamic(0x3B2A17, 0xF5EEE0)
    static let destructive = ezberDynamic(0x8F4E44, 0xB67166)
    static let destructiveForeground = ezberDynamic(0xF7F5EF, 0x0F0D08)

    /// Hairlines: opaque greige in light, 12 % ink in dark.
    static let border = ezberDynamic(0xD4D1C8, 0xEAE8E0, darkAlpha: 0.12)
    static let input = ezberDynamic(0xD4D1C8, 0xEAE8E0, darkAlpha: 0.15)
    static let ring = ezberDynamic(0x344F3D, 0x83B28C, alpha: 0.45)

    /// The floating tab bar tint (`bg-card/95` in the kit).
    static let floatingBar = card.opacity(0.95)
}

/// Builds a `Color` that resolves per colour scheme, matching the kit's
/// `:root` / `.dark` pairs.
private func ezberDynamic(
    _ light: UInt32,
    _ dark: UInt32,
    alpha: CGFloat = 1,
    darkAlpha: CGFloat? = nil
) -> Color {
    Color(UIColor { traits in
        let isDark = traits.userInterfaceStyle == .dark
        return UIColor(ezberRGB: isDark ? dark : light)
            .withAlphaComponent(isDark ? (darkAlpha ?? alpha) : alpha)
    })
}

private extension UIColor {
    convenience init(ezberRGB: UInt32) {
        self.init(
            red: CGFloat((ezberRGB >> 16) & 0xFF) / 255,
            green: CGFloat((ezberRGB >> 8) & 0xFF) / 255,
            blue: CGFloat(ezberRGB & 0xFF) / 255,
            alpha: 1
        )
    }
}

// MARK: - Typography

/// Plus Jakarta Sans for the interface and Source Serif 4 for transliteration,
/// the two OFL fonts the kit self-hosts. The files live in
/// `Resources/Fonts/` and are registered at first use; if a file is missing the
/// helper falls back to the system faces without crashing.
enum EzberFont {

    // Kit type scale: 30/36 display, 20/28 title, 16/24 body, 14/20 caption,
    // 12/16 micro and eyebrow (tracked and uppercased where used).

    static let display: Font = jakarta(.semibold, size: 30, relativeTo: .title)
    static let screenTitle: Font = jakarta(.semibold, size: 24, relativeTo: .title2)
    static let title: Font = jakarta(.semibold, size: 20, relativeTo: .title3)
    static let body: Font = jakarta(.regular, size: 16, relativeTo: .body)
    static let bodyMedium: Font = jakarta(.medium, size: 16, relativeTo: .body)
    static let label: Font = jakarta(.medium, size: 14, relativeTo: .subheadline)
    static let caption: Font = jakarta(.regular, size: 14, relativeTo: .subheadline)
    static let micro: Font = jakarta(.medium, size: 12, relativeTo: .caption)
    static let eyebrow: Font = jakarta(.medium, size: 12, relativeTo: .caption)

    /// CSS `tracking-[0.08em]` at 12 pt.
    static let microTracking: CGFloat = 0.96
    /// CSS `tracking-[0.14em]` at 12 pt.
    static let eyebrowTracking: CGFloat = 1.68

    /// Arabic script has no kit token; the scaffold's baseline is named here so
    /// there is a single tuning point (report §5.5.5).
    static let arabicPoints: CGFloat = 30
    static let arabicLineSpacing: CGFloat = 10

    enum TransliterationSize: CaseIterable {
        case detail   // 16/24
        case home     // 20/28
        case player   // 30/36 primary hero
        case car      // 48/48

        var points: CGFloat {
            switch self {
            case .detail: return 16
            case .home: return 20
            case .player: return 30
            case .car: return 48
            }
        }

        var relativeTo: Font.TextStyle {
            switch self {
            case .detail: return .body
            case .home: return .title3
            case .player: return .title
            case .car: return .largeTitle
            }
        }

        /// CSS leading is a multiplier (`leading-snug` = 1.375); SwiftUI
        /// `lineSpacing` is extra points, so add 37.5 % of the point size.
        var lineSpacing: CGFloat { (points * 0.375).rounded() }
    }

    static func transliteration(_ size: TransliterationSize) -> Font {
        _ = fontsRegistered
        if UIFont(name: "SourceSerif4-Regular", size: size.points) != nil {
            return .custom("SourceSerif4-Regular", size: size.points, relativeTo: size.relativeTo)
        }
        return .system(size.relativeTo, design: .serif)
    }

    enum JakartaWeight {
        case regular
        case medium
        case semibold

        var postScriptName: String {
            switch self {
            case .regular: return "PlusJakartaSans-Regular"
            case .medium: return "PlusJakartaSans-Medium"
            case .semibold: return "PlusJakartaSans-SemiBold"
            }
        }

        var systemWeight: Font.Weight {
            switch self {
            case .regular: return .regular
            case .medium: return .medium
            case .semibold: return .semibold
            }
        }
    }

    static func jakarta(
        _ weight: JakartaWeight,
        size: CGFloat,
        relativeTo style: Font.TextStyle
    ) -> Font {
        _ = fontsRegistered
        if UIFont(name: weight.postScriptName, size: size) != nil {
            return .custom(weight.postScriptName, size: size, relativeTo: style)
        }
        return .system(style, design: .default).weight(weight.systemWeight)
    }

    /// Registers the bundled OFL fonts once per process, so the app does not
    /// depend on an Info.plist `UIAppFonts` entry. The bundle is enumerated
    /// because a file-system-synchronized group may keep the `Resources/Fonts`
    /// folder or flatten it into the bundle root.
    private static let fontsRegistered: Bool = {
        let bundleURL = Bundle.main.bundleURL
        var urls: Set<URL> = []
        if let enumerator = FileManager.default.enumerator(
            at: bundleURL,
            includingPropertiesForKeys: nil
        ) {
            for case let url as URL in enumerator {
                let ext = url.pathExtension.lowercased()
                if ext == "ttf" || ext == "otf" {
                    urls.insert(url)
                }
            }
        }
        for url in urls {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
        return true
    }()

    /// Called at launch for clarity; registration is lazy and idempotent.
    static func registerBundledFonts() {
        _ = fontsRegistered
    }
}

extension Text {
    /// Kit micro style: 12 pt medium, 0.08 em tracking, uppercase.
    func ezberMicro() -> Text {
        font(EzberFont.micro)
            .tracking(EzberFont.microTracking)
            .textCase(.uppercase)
    }

    /// Kit eyebrow style: 12 pt medium, 0.14 em tracking, uppercase.
    func ezberEyebrow() -> Text {
        font(EzberFont.eyebrow)
            .tracking(EzberFont.eyebrowTracking)
            .textCase(.uppercase)
    }
}

// MARK: - Spacing

/// 4 pt base grid. Named values cover the contexts the kit documents rather
/// than every step.
enum EzberSpacing {
    static let x1: CGFloat = 4
    static let x2: CGFloat = 8
    static let x3: CGFloat = 12
    static let x4: CGFloat = 16
    static let x5: CGFloat = 20
    static let x6: CGFloat = 24
    static let x8: CGFloat = 32

    /// Screen horizontal padding (kit `px-5`).
    static let screen: CGFloat = 20
    /// Default card padding (kit `p-5` emphasis; cards range 16–24).
    static let card: CGFloat = 20
    static let cardCompact: CGFloat = 16
    static let cardRoomy: CGFloat = 24
}

// MARK: - Radii

/// Kit `--radius: 1.1rem` scale, rounded to points. Every corner uses
/// `.continuous` to match the kit's stated intent.
enum EzberRadius {
    static let sm: CGFloat = 10.5
    static let md: CGFloat = 14
    static let lg: CGFloat = 17.5
    static let xl: CGFloat = 24.5
    /// Cards (kit `rounded-2xl`, 32 pt).
    static let card: CGFloat = 32
    /// Large CTA / floating panels (kit `rounded-3xl`, 38.5 pt).
    static let panel: CGFloat = 38.5
}

// MARK: - Shadow and border helpers

enum EzberShadow {
    /// The kit's only shadow (`shadow-sm`): `0 1px 3px rgba(0,0,0,.1)` plus a
    /// tighter layer. One layer is enough on iOS.
    static let smColor = Color.black.opacity(0.1)
    static let smRadius: CGFloat = 1.5
    static let smY: CGFloat = 1
}

extension View {
    /// Kit `shadow-sm`, used only on floating elements (primary transport
    /// button, large CTA, floating panels).
    func ezberSmShadow() -> some View {
        shadow(color: EzberShadow.smColor, radius: EzberShadow.smRadius, x: 0, y: EzberShadow.smY)
    }

    /// A true 1 px hairline: `border border-border` at the display scale.
    func ezberBorder(radius: CGFloat, color: Color = EzberColor.border) -> some View {
        modifier(EzberBorderModifier(radius: radius, color: color))
    }
}

private struct EzberBorderModifier: ViewModifier {
    @Environment(\.displayScale) private var displayScale

    let radius: CGFloat
    let color: Color

    func body(content: Content) -> some View {
        content.overlay(
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .strokeBorder(color, lineWidth: 1 / max(displayScale, 1))
        )
    }
}
