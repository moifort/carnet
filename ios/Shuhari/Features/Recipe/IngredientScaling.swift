import Foundation

/// Ephemeral proportional scaling of the recipe sheet's shopping list: step one
/// ingredient's quantity and every other one follows the same factor. Pure string
/// logic — quantities stay the display strings the AI wrote ("1,2 kg", "75 cl",
/// "1 gousse"); the stored version is never rewritten (a version's content is
/// immutable), the factor lives only while the sheet is open.
enum IngredientScaling {
    private static let locale = Locale(identifier: "fr_FR")

    /// Whether a quantity can be scaled: it leads with a number. "Sel" or
    /// "Quelques brins" have nothing to multiply and always render as written.
    static func isScalable(_ quantity: String) -> Bool {
        parse(quantity) != nil
    }

    /// The quantity as the sheet shows it under `factor`. Factor 1 returns the
    /// original string untouched — the stored recipe is never reformatted.
    static func scaled(_ quantity: String, by factor: Double) -> String {
        guard factor != 1, let parsed = parse(quantity) else { return quantity }
        return format(rounded(parsed.value * factor, family: parsed.family), as: parsed)
    }

    /// The factor after one −/+ tick on this ingredient: its displayed value moves
    /// by one grain (see `grain`) and the whole list follows. Nil when the quantity
    /// is not scalable; the current factor (a no-op) when the tick would hit zero.
    static func factorAfterStep(on quantity: String, from factor: Double, direction: Int) -> Double? {
        guard let parsed = parse(quantity) else { return nil }
        let displayed = rounded(parsed.value * factor, family: parsed.family)
        let next = stepped(displayed, direction: direction, family: parsed.family)
        guard next > 0 else { return factor }
        let resized = next / parsed.value
        // A tick that lands back on the stored quantity owes exactly 1: float dust
        // would otherwise leave the list flagged as resized when it no longer is.
        return (resized - 1).magnitude < 1e-9 ? 1 : resized
    }

    /// The header's factor badge, e.g. "×0,75".
    static func factorLabel(_ factor: Double) -> String {
        "×\(number(factor, maxFraction: 2))"
    }

    // MARK: - Parsing

    // What rounding and stepping a quantity obeys. Masses and volumes work in a
    // canonical unit (grams / millilitres); counts stay raw and move by halves.
    private enum Family {
        case mass
        case volume
        case count
    }

    private struct Parsed {
        /// Canonical value: grams for a mass, millilitres for a volume, the raw
        /// figure for a count.
        let value: Double
        let family: Family
        /// The unit as written ("kg", "cl", empty for a bare count) — display
        /// stays in the family the cook wrote.
        let unit: String
        /// A count's free-text tail, carried through untouched ("gousse", "c. à s.").
        let suffix: String
        /// The AI's estimated gram equivalent of the written quantity — the "(6 g)"
        /// of "1 c. à café (6 g)" — rescaled with the count so the pair never lies.
        let gramEquivalent: Double?
    }

    private static let unitScales: [String: (family: Family, toCanonical: Double)] = [
        "g": (.mass, 1), "kg": (.mass, 1000), "mg": (.mass, 0.001),
        "ml": (.volume, 1), "cl": (.volume, 10), "dl": (.volume, 100), "l": (.volume, 1000),
    ]

    private static func parse(_ quantity: String) -> Parsed? {
        let trimmed = quantity.trimmingCharacters(in: .whitespaces)
        guard let match = trimmed.wholeMatch(of: /([0-9]+(?:[.,][0-9]+)?)\s*(.*)/),
              let figure = Double(match.1.replacingOccurrences(of: ",", with: ".")),
              figure > 0
        else { return nil }
        let rest = String(match.2).trimmingCharacters(in: .whitespaces)

        // A unit only counts when it is the whole tail: "kg" in "1,2 kg", but
        // "1 gousse" or "2 g râpé" fall through to a count with a free suffix.
        if let unit = unitScales[rest.lowercased()] {
            return Parsed(value: figure * unit.toCanonical, family: unit.family, unit: rest.lowercased(), suffix: "", gramEquivalent: nil)
        }
        // An imprecise kitchen unit carries the AI's gram estimate in a trailing
        // "(6 g)": detach it from the suffix so it rescales instead of freezing.
        if let grams = rest.wholeMatch(of: /(.*?)\s*\(([0-9]+(?:[.,][0-9]+)?)\s*g\)/),
           let equivalent = Double(grams.2.replacingOccurrences(of: ",", with: ".")) {
            return Parsed(value: figure, family: .count, unit: "", suffix: String(grams.1), gramEquivalent: equivalent)
        }
        return Parsed(value: figure, family: .count, unit: "", suffix: rest, gramEquivalent: nil)
    }

    // MARK: - Rounding & stepping

    // Smart rounding: derived values land on kitchen-realistic grains rather than
    // "526,4 ml" — the grain follows the magnitude, halves for counts, tenths under
    // 10 g/ml so the "1,2 g" of levure a recipe is written with survives a factor.
    // Deliberately finer than what a tick moves on (see `grain`): the line you touch
    // jumps on a round kitchen grain, the ones that follow keep what they are worth.
    private static func rounded(_ value: Double, family: Family) -> Double {
        switch family {
        case .count:
            return max(0.5, (value * 2).rounded() / 2)
        case .mass, .volume:
            let grain: Double = if value >= 1000 { 10 } else if value >= 100 { 5 } else if value >= 10 { 1 } else { 0.1 }
            return max(grain, (value / grain).rounded() * grain)
        }
    }

    // What one tick moves on. The grain follows the magnitude — a kilo of bœuf has no
    // business moving by the gram — with one exception: a quantity carrying a decimal
    // keeps its tenth, so the 1,2 g of levure never gets rounded off by its own stepper.
    //
    // `decrementing` reads the magnitude just below the value, so a tick down off an
    // exact threshold moves on the grain of the zone it lands in: 10 g goes down to
    // 9 g, and 9 g back up to 10 g. Without it the stepper would not be reversible.
    private static func grain(for value: Double, family: Family, decrementing: Bool) -> Double {
        guard family != .count else { return 0.5 }
        let magnitude = decrementing ? value.nextDown : value
        if magnitude >= 1000 { return 100 } // a tenth of the kilo/litre it displays as
        if magnitude >= 10 { return 5 }
        if magnitude >= 1, value.truncatingRemainder(dividingBy: 1) == 0 { return 1 }
        return 0.1
    }

    // One tick, snapped onto the grain rather than added to the value: 12 g goes up
    // to 15 g, not 17 g — a kitchen quantity is written ON its grain, not beside it.
    private static func stepped(_ displayed: Double, direction: Int, family: Family) -> Double {
        let size = grain(for: displayed, family: family, decrementing: direction < 0)
        let exact = displayed / size
        // A value already sitting on its grain owes a full tick, so only genuine
        // float noise is rounded away before the floor/ceiling snaps it.
        let ticks = (exact.rounded() - exact).magnitude < 1e-9
            ? exact.rounded()
            : exact.rounded(direction > 0 ? .down : .up)
        return (ticks + Double(direction)) * size
    }

    // MARK: - Formatting

    private static func format(_ value: Double, as parsed: Parsed) -> String {
        switch parsed.family {
        case .mass:
            value >= 1000 ? "\(number(value / 1000, maxFraction: 2)) kg" : "\(number(value, maxFraction: 1)) g"
        case .volume:
            if value >= 1000 {
                "\(number(value / 1000, maxFraction: 2)) l"
            } else if parsed.unit == "cl" || parsed.unit == "dl" {
                // Stay in the unit the cook wrote: "75 cl" scales to "52,5 cl", not "525 ml".
                "\(number(value / (parsed.unit == "cl" ? 10 : 100), maxFraction: 1)) \(parsed.unit)"
            } else {
                "\(number(value, maxFraction: 1)) ml"
            }
        case .count:
            countFormat(value, as: parsed)
        }
    }

    private static func countFormat(_ value: Double, as parsed: Parsed) -> String {
        let base = parsed.suffix.isEmpty
            ? number(value, maxFraction: 1)
            : "\(number(value, maxFraction: 1)) \(parsed.suffix)"
        guard let equivalent = parsed.gramEquivalent else { return base }
        // The grams follow the count as displayed (not the raw factor), so the
        // pair stays coherent: "1 c. à soupe (15 g)" halved is "0,5 c. à soupe (7,5 g)".
        let grams = rounded(equivalent * value / parsed.value, family: .mass)
        return "\(base) (\(number(grams, maxFraction: 1)) g)"
    }

    private static func number(_ value: Double, maxFraction: Int) -> String {
        value.formatted(.number.precision(.fractionLength(0...maxFraction)).locale(locale))
    }
}
