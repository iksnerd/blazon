import type { Rgba } from './colors.js';
import { dp } from './dimensions.js';
import { assetName, swiftFile, typeName } from './names.js';
import type { Plan } from './plan.js';

const HEADER = '// Written by blazon.platform-tokens from brand.json. Do not edit: build again instead.';

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const INFO = { author: 'blazon', version: 1 };

const byteHex = (n: number): string => `0x${n.toString(16).padStart(2, '0').toUpperCase()}`;

/** An asset catalog entry: sRGB components as hex bytes and the alpha as a decimal, which Xcode and actool read */
const entry = (c: Rgba, dark = false) => ({
  idiom: 'universal',
  ...(dark && { appearances: [{ appearance: 'luminosity', value: 'dark' }] }),
  color: { 'color-space': 'srgb', components: { red: byteHex(c.red), green: byteHex(c.green), blue: byteHex(c.blue), alpha: (c.alpha / 255).toFixed(3) } },
});

const unit = (n: number): string => `${byteHex(n)} / 255`;
const srgb = (c: Rgba): string => `Color(.sRGB, red: ${unit(c.red)}, green: ${unit(c.green)}, blue: ${unit(c.blue)}, opacity: ${c.alpha === 255 ? '1' : unit(c.alpha)})`;
const rgba = (c: Rgba): string => `BlazonRGBA(red: ${unit(c.red)}, green: ${unit(c.green)}, blue: ${unit(c.blue)}, alpha: ${c.alpha === 255 ? '1' : unit(c.alpha)})`;

// A color that follows the appearance. UIColor and NSColor take a closure that runs each time the system draws; elsewhere (watchOS) the light value is used.
const DYNAMIC = `private struct BlazonRGBA {
    let red: Double
    let green: Double
    let blue: Double
    let alpha: Double
}

extension Color {
    /// A color that follows the system appearance: iOS 13 and later, macOS 10.15 and later.
    fileprivate init(blazonLight light: BlazonRGBA, dark: BlazonRGBA) {
        #if canImport(UIKit)
        self.init(UIColor { traits in
            let c = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: c.red, green: c.green, blue: c.blue, alpha: c.alpha)
        })
        #elseif canImport(AppKit)
        self.init(NSColor(name: nil) { appearance in
            let c = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light
            return NSColor(srgbRed: c.red, green: c.green, blue: c.blue, alpha: c.alpha)
        })
        #else
        self.init(.sRGB, red: light.red, green: light.green, blue: light.blue, opacity: light.alpha)
        #endif
    }
}`;

/** iOS: BlazonTokens.swift (or <Prefix>Tokens.swift) with enums of SwiftUI Colors and CGFloat dimensions, and an asset catalog with a colorset for each color, with dark appearances */
export function iosFiles(plan: Plan): Map<string, string> {
  const files = new Map<string, string>();
  if (plan.colors.length) {
    files.set('ios/Colors.xcassets/Contents.json', json({ info: INFO }));
    for (const c of plan.colors)
      files.set(
        `ios/Colors.xcassets/${assetName(plan.prefix, c.swift)}.colorset/Contents.json`,
        json({ colors: [entry(c.light), ...(c.dark ? [entry(c.dark, true)] : [])], info: INFO }),
      );
  }
  if (!plan.colors.length && !plan.dimensions.length) return files;

  const dynamic = plan.colors.some((c) => c.dark);
  const out = [HEADER, 'import SwiftUI'];
  if (dynamic) out.push('#if canImport(UIKit)', 'import UIKit', '#elseif canImport(AppKit)', 'import AppKit', '#endif');
  if (plan.colors.length)
    out.push(
      '',
      `public enum ${typeName(plan.prefix, 'Colors')} {`,
      ...plan.colors.map((c) => `    public static let ${c.swift} = ${c.dark ? `Color(blazonLight: ${rgba(c.light)}, dark: ${rgba(c.dark)})` : srgb(c.light)}`),
      '}',
    );
  if (plan.dimensions.length)
    out.push(
      '',
      '// px tokens are points 1:1; rem tokens are 16 points to the rem.',
      `public enum ${typeName(plan.prefix, 'Dimensions')} {`,
      ...plan.dimensions.map((d) => `    public static let ${d.swift}: CGFloat = ${dp(d.dp)}`),
      '}',
    );
  if (dynamic) out.push('', DYNAMIC);
  files.set(`ios/${swiftFile(plan.prefix)}`, `${out.join('\n')}\n`);
  return files;
}
