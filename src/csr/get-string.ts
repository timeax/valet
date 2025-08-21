// src/csr/get-string.ts
import { extractUsesAndClean, renderUseStatements } from "../utils/sass-uses";

export function getString(
  rawCode: string,
  colorsVar: string = "$colors",
  themeKeys: string[] = []
) {
  const themeList = `(${themeKeys.map(k => `'${k}'`).join(", ")})`;
  const { code, uses } = extractUsesAndClean(rawCode);

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

// join path + segment with "-" (skip empty bits)
@function s_join($a, $b) {
  @if $a == null or $a == "" { @return $b; }
  @if $b == null or $b == "" { @return $a; }
  @return $a + "-" + $b;
}

// normalize "default" suffix away (e.g. "theme-default" -> "theme")
@function s_trim_default($name) {
  @if $name == null { @return $name; }
  $suffix: "-default";
  $i: string.index($name, $suffix);
  @if $i != null and $i == string.length($name) - string.length($suffix) + 1 {
    @return string.slice($name, 1, string.length($name) - string.length($suffix));
  }
  @return $name;
}

// ---- global state for the collector (scoped to this file) ----
$g_root-vars: () !default;   // name -> value
$g_theme-vars: () !default;  // theme -> (name -> value)
$g_base-values: () !default; // name -> value (for @theme)
$g_needs-root: () !default;  // set(name)

// set-put / set-has
@function s_set_put($set, $key) { @return map.merge($set, ( $key: true )); }
@function s_set_has($set, $key) { @return map.has-key($set, $key); }

// ---- recursive collector ----
@mixin s_collect($mapVal, $path: "", $promote: false) {
  @each $rawKey, $val in $mapVal {
    $k: s_str($rawKey);

    // Themed override like "--dark-foo" (or "--dark-50"/"--dark-default")
    @if s_starts_with($k, "--") and s_contains($k, "-") and meta.type-of($val) != 'map' {
      $tmp: s_after($k, "--");
      $dash: s_first_dash($tmp);
      @if $dash != null {
        $theme: string.slice($tmp, 1, $dash - 1);
        $rest: string.slice($tmp, $dash + 1); // "foo" | "50" | "default"
        $namePart: if($rest == "default", "", $rest);
        $varName: s_trim_default(s_join($path, $namePart));
        @if list.index($s_theme_keys, $theme) {
          $set: map.get($g_theme-vars, $theme);
          @if $set == null { $set: (); }
          $set: map.merge($set, ( $varName: $val ));
          $g_theme-vars: map.merge($g_theme-vars, ( $theme: $set )) !global;
          $g_needs-root: s_set_put($g_needs-root, $varName) !global;
        } @else {
          // unknown theme → keep raw themed key in the name
          $kept: s_join($path, $k);
          $g_base-values: map.merge($g_base-values, ( $kept: $val )) !global;
        }
      }
      @continue;
    }

    // Handle leading "#" (promotion)
    $segPromote: false;
    @if s_starts_with($k, "#") {
      $segPromote: true;
      $k: s_after($k, "#");
    }

    @if meta.type-of($val) == 'map' {
      $nextPath: if($k == "default", $path, s_join($path, $k));
      @include s_collect($val, $nextPath, $promote or $segPromote);
      @continue;
    }

    // Leaf
    $leafName: if($k == "default", $path, s_join($path, $k));
    $g_base-values: map.merge($g_base-values, ( $leafName: $val )) !global;

    @if $promote or $segPromote {
      $g_root-vars: map.merge($g_root-vars, ( $leafName: $val )) !global;
    }
  }
}

// Promote any var that has a known theme override
@mixin s_finalize_promotions() {
  @each $name, $flag in $g_needs-root {
    @if not map.has-key($g_root-vars, $name) and map.has-key($g_base-values, $name) {
      $g_root-vars: map.merge($g_root-vars, ($name: map.get($g_base-values, $name))) !global;
    }
  }
}

// is this safe to emit as CSS value?
@function s_is_scalar($v) {
  $t: meta.type-of($v);
  @return $v != null and $v != "" and $t != 'map';
}

// ---- CLEAN EMPTIES (defensive: avoid "--foo: ;" and maps) ----
@mixin s_clean_state() {
  $__clean_root: ();
  @each $name, $value in $g_root-vars {
    @if s_is_scalar($value) {
      $__clean_root: map.merge($__clean_root, ($name: $value));
    }
  }
  $g_root-vars: $__clean_root !global;

  $__clean_base: ();
  @each $name, $value in $g_base-values {
    @if s_is_scalar($value) {
      $__clean_base: map.merge($__clean_base, ($name: $value));
    }
  }
  $g_base-values: $__clean_base !global;
}

// Emit blocks
@mixin s_emit() {
  // :root
  :root {
    @each $name, $value in $g_root-vars {
      @if s_is_scalar($value) {
        --#{$name}: #{$value};
      }
    }
  }

  // theme overrides
  @each $theme, $vars in $g_theme-vars {
    .#{$theme} {
      @each $name, $value in $vars {
        @if s_is_scalar($value) {
          --#{$name}: #{$value};
        }
      }
    }
  }

  // @theme
  @theme {
    @each $name, $value in $g_base-values {
      @if map.has-key($g_root-vars, $name) {
        --color-#{$name}: var(--#{$name});
      } @else if s_is_scalar($value) {
        --color-#{$name}: #{$value};
      }
      // else: skip non‑scalar to avoid invalid CSS
    }
  }
}

@mixin s_walk_colors($rootMap) {
  // reset
  $g_root-vars: () !global;
  $g_theme-vars: () !global;
  $g_base-values: () !global;
  $g_needs-root: () !global;

  // collect
  @include s_collect($rootMap, "", false);

  // ensure promotions
  @include s_finalize_promotions();

  // **clean empties** before emitting
  @include s_clean_state();

  // emit
  @include s_emit();
}

// ===== user content =====
${code}

// ===== emit blocks =====
@include s_walk_colors(${colorsVar});
`;
}