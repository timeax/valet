// src/utils/color-format.ts
import postcss from "postcss";
import {
  converter,
  formatCss,
  inGamut,
  clampChroma,
  formatHex,
  formatHex8,
} from "culori";

export type ColorFormat = "hex" | "rgb" | "rgba" | "oklch";

// Manual OKLCH channel rounding (version-proof)
function roundOklchChannels(
  c: any,
  places = 4
): any {
  if (!c || c.mode !== "oklch") return c;
  const r = (n: any) =>
    typeof n === "number" ? Number(n.toFixed(places)) : n;
  return {
    ...c,
    l: r(c.l),
    c: r(c.c),
    h: r(c.h),
    alpha: r(c.alpha),
  };
}

export function transformCssColorFormat(
  css: string,
  target: ColorFormat
): string {
  if (!target) return css;

  const toOklch = converter("oklch");
  const toRgb = converter("rgb");
  const withinRgb = inGamut("rgb");

  const root = postcss.parse(css || "");

  root.walkDecls((d) => {
    // only touch our generated custom props
    if (!d.prop || !d.prop.startsWith("--")) return;

    const v = (d.value || "").trim();
    if (!v || /var\(/i.test(v) || /calc\(/i.test(v)) return;

    try {
      let out: string | undefined;

      switch (target) {
        case "oklch": {
          let c = toOklch(v);
          if (!c) break;
          if (!withinRgb(c)) c = clampChroma(c, "oklch");
          c = roundOklchChannels(c, 4);           // <-- round channels here
          out = formatCss(c);                      // -> compact oklch(...)
          break;
        }
        case "rgb": {
          const c = toRgb(v);
          if (!c) break;
          out = formatCss(c).replace(/^rgba\((.*)\)$/i, "rgb($1)");
          break;
        }
        case "rgba": {
          const c = toRgb(v);
          if (!c) break;
          const s = formatCss(c);
          out = /^rgb\(/i.test(s) ? s.replace(/^rgb\(/i, "rgba(").replace(/\)$/, ", 1)") : s;
          break;
        }
        case "hex": {
          const c = toRgb(v);
          if (!c) break;
          out = typeof c.alpha === "number" && c.alpha < 1 ? formatHex8(c) : formatHex(c);
          break;
        }
      }

      if (out) d.value = out;
    } catch {
      // leave unparsable values as-is
    }
  });

  return root.toResult().css;
}