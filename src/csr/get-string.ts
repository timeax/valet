// src/csr/get-string.ts
export function getString(
  code: string,
  colorsVar: string = "$colors",
  themeKeys: string[] = []
) {
  const themeList = `(${themeKeys.map(k => `'${k}'`).join(", ")})`;

  return `
// ===== injected helpers (module API; no global built-ins) =====
@use "sass:string";
@use "sass:list";
@use "sass:map";
@use "sass:meta";

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

    // (0) top-level themed override: --dark-name: value (rare; kept for completeness)
    @if s_starts_with($k, "--") and s_contains($k, "-") and meta.type-of($val) != 'map' {
      $tmp: s_after($k, "--");           // "dark-name"
      $dash: s_first_dash($tmp);
      @if $dash != null {
        $theme: string.slice($tmp, 1, $dash - 1);
        $nameRest: string.slice($tmp, $dash + 1); // "name"
        @if list.index($s_theme_keys, $theme) {
          $set: map.get($theme-vars, $theme); @if $set == null { $set = (); }
          $set: map.merge($set, ( $nameRest: $val ));
          $theme-vars: map.merge($theme-vars, ( $theme: $set ));
          $needs-root: s_set_put($needs-root, $nameRest);
        } @else {
          // unknown theme → keep full key as literal base value
          $base-values: map.merge($base-values, ( $k: $val ));
        }
      }
      @continue;
    }

    // (1) scalar: name: color OR #name: color
    @if meta.type-of($val) != 'map' {
      $name: $k;
      $flagged: false;
      @if s_starts_with($name, "#") { $flagged = true; $name: s_after($name, "#"); }

      // record base value for @theme
      $base-values: map.merge($base-values, ( $name: $val ));

      // promote to :root only if flagged OR required by known theme overrides
      @if $flagged or s_set_has($needs-root, $name) {
        $root-vars: map.merge($root-vars, ( $name: $val ));
      }
      @continue;
    }

    // (2) map palette (with shades and/or themed entries)
    $pname: $k;
    $all-to-root: false;
    @if s_starts_with($pname, "#") { $all-to-root = true; $pname: s_after($pname, "#"); }

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
            $set: map.get($theme-vars, $theme); @if $set == null { $set = (); }
            $set: map.merge($set, ( $varName: $shadeVal ));
            $theme-vars: map.merge($theme-vars, ( $theme: $set ));
            $needs-root: s_set_put($needs-root, $varName);
          } @else {
            // unknown theme → keep original themed key in the name
            $keptName: $pname + "-" + $skey; // e.g. "danger---weird-50"
            $base-values: map.merge($base-values, ( $keptName: $shadeVal ));
          }
        }
      } @else {
        // regular shade (may be "#"-flagged)
        $shadeFlagged: false;
        @if s_starts_with($skey, "#") { $shadeFlagged = true; $skey: s_after($skey, "#"); }

        // normalize "default" → base name (no suffix)
        $varName: if($skey == "default", $pname, $pname + "-" + $skey);

        // record base for @theme
        $base-values: map.merge($base-values, ( $varName: $shadeVal ));

        // promote if palette flagged, shade flagged, or required by known theme override
        @if $all-to-root or $shadeFlagged or s_set_has($needs-root, $varName) {
          $root-vars: map.merge($root-vars, ( $varName: $shadeVal ));
        }
      }
    }
  }

  // ---- normalize any "*-default" keys in $base-values and $root-vars ----
  $__norm_base: ();
  @each $name, $value in $base-values {
    $__norm_base: map.merge($__norm_base, ( s_trim_default($name): $value ));
  }
  $base-values: $__norm_base;

  $__norm_root: ();
  @each $name, $value in $root-vars {
    $__norm_root: map.merge($__norm_root, ( s_trim_default($name): $value ));
  }
  $root-vars: $__norm_root;

  // ensure every var with a known theme override is promoted to :root (order independent)
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