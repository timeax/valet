// src/csr/get-string.ts

// src/utils/sass-uses.ts

// Always include these (no duplicates will be produced)
const DEFAULT_USES = [
  `@use "sass:string";`,
  `@use "sass:list";`,
  `@use "sass:map";`,
  `@use "sass:meta";`,
];

/**
 * Extract all @use statements from a Sass/SCSS string and return:
 *  - uses: a Set of normalized @use lines (includes DEFAULT_USES)
 *  - code: the original code with all @use lines removed (and extra blank lines collapsed)
 */
export function extractUsesAndClean(code: string): { uses: Set<string>; code: string } {
  const src = code ?? "";

  // Match whole @use lines (with optional trailing comment), multi-line safe
  // Examples matched:
  //   @use "sass:map";
  //   @use "sass:string" as s;
  //   @use "x" with ($a: 1); // comment
  const useLineRe = /^[ \t]*@use\s+["'][^"']+["'][^;\n]*;?[^\n]*$/gim;

  // Collect matches
  const matches = src.match(useLineRe) || [];

  // Normalize to single-line, trailing semicolon
  const normalize = (s: string) =>
    s
      .trim()
      // keep everything before inline comment, but preserve it if present
      // (remove trailing spaces before ;, ensure exactly one ;)
      .replace(/[ \t]*;?[ \t]*$/, ";");

  const uses = new Set<string>(DEFAULT_USES.map(normalize));
  for (const m of matches) uses.add(normalize(m));

  // Remove all matched lines from code
  const cleaned = src
    .replace(useLineRe, "")            // drop @use lines
    .replace(/[ \t]+\n/g, "\n")        // trim trailing spaces on now-empty lines
    .replace(/\n{3,}/g, "\n\n")        // collapse multiple blank lines
    .trimStart();                      // avoid leading blank

  return { uses, code: cleaned };
}

/** Render a set/array of @use statements as a single block (deduped & normalized). */
export function renderUseStatements(uses: Iterable<string>): string {
  const out = new Set<string>();
  for (const u of uses) {
    const line = String(u).trim();
    if (!line) continue;
    if (!/^@use\b/i.test(line)) continue;
    out.add(line.replace(/[ \t]*;?[ \t]*$/, ";"));
  }
  return Array.from(out).join("\n");
}


export function getString(
  rawCode: string,
  colorsVar: string = "$colors",
  themeKeys: string[] = []
) {
  const themeList = `(${themeKeys.map(k => `'${k}'`).join(", ")})`;
  let { code, uses } = extractUsesAndClean(rawCode);

  return `
// ===== injected helpers (module API; no global built-ins) =====
${renderUseStatements(uses)}

$s_theme_keys: ${themeList} !default;

// stringify any value
@function s_str($v) { @return #{$v}; }

// starts-with
@function s_starts_with($s, $prefix) { @return string.index($s, $prefix) == 1; }

// substring after prefix
@function s_after($s, $prefix) { @return string.slice($s, string.length($prefix) + 1); }

// contains
@function s_contains($s, $needle) { @return string.index($s, $needle) != null; }

// first dash index
@function s_first_dash($s) { @return string.index($s, "-"); }

// ends-with (for "-default")
@function s_ends_with($s, $suffix) {
  $i: string.index($s, $suffix);
  @return $i != null and $i == string.length($s) - string.length($suffix) + 1;
}

// trim trailing "-default"
@function s_trim_default($name) {
  @return if(s_ends_with($name, "-default"), string.slice($name, 1, string.length($name) - 8), $name);
}

// maps-as-sets helpers
@function s_set_put($set, $key) { @return map.merge($set, ( $key: true )); }
@function s_set_has($set, $key) { @return map.has-key($set, $key); }

@mixin s_walk_colors($map) {
  // name := "palette-shade" or scalar "name" or keys with "--" for unknown themes
  $root-vars: ();   // name -> color
  $theme-vars: ();  // theme -> ( name -> color )
  $base-values: (); // name -> color (for @theme literals or var())
  $needs-root: ();  // names to promote into :root due to known theme overrides

  @each $key, $val in $map {
    $k: s_str($key);

    // (0) top-level themed override: --dark-name: value
    @if s_starts_with($k, "--") and s_contains($k, "-") and meta.type-of($val) != 'map' {
      $tmp: s_after($k, "--");           // "dark-name"
      $dash: s_first_dash($tmp);
      @if $dash != null {
        $theme: string.slice($tmp, 1, $dash - 1);
        $nameRest: string.slice($tmp, $dash + 1); // e.g. "primary" or "primary-600"
        @if list.index($s_theme_keys, $theme) {
          $set: map.get($theme-vars, $theme);
          @if $set == null { $set: (); }
          $set: map.merge($set, ( $nameRest: $val ));
          $theme-vars: map.merge($theme-vars, ( $theme: $set ));
          $needs-root: s_set_put($needs-root, $nameRest);
        } @else {
          // unknown theme → keep full key as literal base value (no stripping)
          $base-values: map.merge($base-values, ( $k: $val ));
        }
      }
      @continue;
    }

    // (1) scalar: name: color OR #name: color
    @if meta.type-of($val) != 'map' {
      $name: $k;
      $flagged: false;
      @if s_starts_with($name, "#") { $flagged: true; $name: s_after($name, "#"); }

      // record base value for @theme (name comes from key, NEVER from value)
      $base-values: map.merge($base-values, ( $name: $val ));

      // promote to :root only if flagged OR required by known theme overrides
      @if $flagged or s_set_has($needs-root, $name) {
        $root-vars: map.merge($root-vars, ( $name: $val ));
      }
      @continue;
    }

    // (2) palette map (with shades and/or themed entries)
    $pname: $k;
    $all-to-root: false;
    @if s_starts_with($pname, "#") { $all-to-root: true; $pname: s_after($pname, "#"); }

    @each $shadeKey, $shadeVal in $val {
      $skey: s_str($shadeKey);

      // inner themed override: --dark-<shade> (or --dark-default)
      @if s_starts_with($skey, "--") and s_contains($skey, "-") {
        $tmp: s_after($skey, "--");      // "dark-50" or "dark-default"
        $dash: s_first_dash($tmp);
        @if $dash != null {
          $theme: string.slice($tmp, 1, $dash - 1);
          $shade: string.slice($tmp, $dash + 1);
          // normalize "default" → base name (no suffix)
          $varName: if($shade == "default", $pname, $pname + "-" + $shade);
          @if list.index($s_theme_keys, $theme) {
            $set: map.get($theme-vars, $theme);
            @if $set == null { $set: (); }
            $set: map.merge($set, ( $varName: $shadeVal ));
            $theme-vars: map.merge($theme-vars, ( $theme: $set ));
            $needs-root: s_set_put($needs-root, $varName);
          } @else {
            // unknown theme inside palette → keep the original themed key in the name
            // so it cannot collide with normal palette-shade names
            $keptName: $pname + "-" + $skey; // e.g. "danger---weird-50"
            $base-values: map.merge($base-values, ( $keptName: $shadeVal ));
          }
        }
      } @else {
        // regular shade; may be "#"-flagged
        $shadeFlagged: false;
        @if s_starts_with($skey, "#") { $shadeFlagged: true; $skey: s_after($skey, "#"); }

        // normalize "default" → base name (no "-default")
        $varName: if($skey == "default", $pname, $pname + "-" + $skey);

        // record base for @theme
        $base-values: map.merge($base-values, ( $varName: $shadeVal ));

        // promote if palette flagged, shade flagged, or required by theme override
        @if $all-to-root or $shadeFlagged or s_set_has($needs-root, $varName) {
          $root-vars: map.merge($root-vars, ( $varName: $shadeVal ));
        }
      }
    }
  }

  // ---- clean empties (defensive: avoid "--foo: ;") ----
  $__clean_root: ();
  @each $name, $value in $root-vars {
    @if $value != null and $value != "" { $__clean_root: map.merge($__clean_root, ($name: $value)); }
  }
  $root-vars: $__clean_root;

  $__clean_base: ();
  @each $name, $value in $base-values {
    @if $value != null and $value != "" { $__clean_base: map.merge($__clean_base, ($name: $value)); }
  }
  $base-values: $__clean_base;

  // ensure every var with a known theme override is promoted to :root
  @each $name, $flag in $needs-root {
    @if not map.has-key($root-vars, $name) and map.has-key($base-values, $name) {
      $root-vars: map.merge($root-vars, ($name: map.get($base-values, $name)));
    }
  }

  // (1) :root with promoted vars
  :root {
    @each $name, $value in $root-vars {
      --#{$name}: #{$value};
    }
  }

  // (2) known theme overrides
  @each $theme, $vars in $theme-vars {
    .#{$theme} {
      @each $name, $value in $vars {
        --#{$name}: #{$value};
      }
    }
  }

  // (3) @theme color map:
  //     - if in :root → var(--name)
  //     - else        → literal color
  @theme {
    @each $name, $value in $base-values {
      @if map.has-key($root-vars, $name) {
        --color-#{$name}: var(--#{$name});
      } @else {
        --color-#{$name}: #{$value};
      }
    }
  }
}

// ===== user content =====
${code}

// ===== emit blocks =====
@include s_walk_colors(${colorsVar});
`;
}