# Valet — Windows Web Dev Utility CLI

Valet is a Windows‑focused developer CLI that streamlines three common workflows:

1. **Local domains** on Windows (hosts + Apache vhosts with safe markers and auto‑restart).
2. **CSR pipeline**: generate/merge design tokens (colors + media + extras) into your app CSS from a single `csr.json` source of truth — with live watch.
3. **SCSS compiler**: compile SCSS → CSS with optional Lightning CSS optimization, a smart import/beacon system, per‑file injected rules, and a watcher.

> Built for Windows (Apache/XAMPP paths, service restart, etc.). Works best with Node 18+.

---

## Quick links

* [Prerequisites and environment](#prerequisites-and-environment)
* [Install](#install)
* [CLI overview](#cli-overview)
* [Local domain management (Windows + Apache)](#local-domain-management-windows--apache)
* [CSR: Color + media pipeline (csrjson)](#csr-color--media-pipeline-csrjson)

    * [CSR quick start](#csr-quick-start)
    * [Color map → tokens (mapping rules)](#color-map--tokens-mapping-rules)
    * [Theme overrides (`themeKeys`)](#theme-overrides-themekeys)
    * [Private branches with `!`](#private-branches-with-)
    * [Media tokens](#media-tokens)
    * [Extras](#extras)
    * [Watching & dynamic reloading](#watching--dynamic-reloading)
    * [CSR usage cheatsheet](#csr-usage-cheatsheet)
* [SCSS compiler (scss.config.json)](#scss-compiler-scssconfigjson)

    * [SCSS quick start](#scss-quick-start)
    * [Path beacon `&<...>`](#path-beacon-)
    * [Conditional additionalData rules](#conditional-additionaldata-rules)
    * [Safe import reordering](#safe-import-reordering)
    * [Lightning CSS integration](#lightning-css-integration)
    * [Watcher behavior](#watcher-behavior)
* [Configuration reference](#configuration-reference)
* [Tips & troubleshooting](#tips--troubleshooting)
* [Development & scripts](#development--scripts)

---

## Prerequisites and environment

* **Windows** (paths and commands assume Windows).
* **Apache httpd** (e.g., XAMPP). Valet restarts Apache via:

  ```bash
  httpd -k restart -n "Apache2.4"
  ```

  If your service name differs, restart manually or align service name.
* **Permissions**: you need rights to write to the hosts file and vhosts file.
* **Node.js** 18+

**Environment overrides**

* `HOSTS`: absolute path to hosts file (default `C:\Windows\System32\drivers\etc\hosts`)
* `DRIVE`: optional drive letter prefix when `HOSTS` is unset (e.g., `D:`)
* `VP`: absolute path to Apache vhosts file (default `D:\xampp\apache\conf\extra\httpd-vhosts.conf`)
* `VD`: optional drive letter prefix when `VP` is unset

---

## Install

```bash
npm i -g @timeax/valet          # install
npm i -g @timeax/valet@latest   # update
```

Binary: `valet` (main script: `dist/index.js`).

Run `valet --help` any time.

---

## CLI overview

* **Domains** (Windows + Apache):

    * `valet install` / `valet i`
    * `valet update`
    * `valet list` / `valet l`
    * `valet del`

* **CSR pipeline** (colors + media + extras):

    * `valet csr [sourceDir] [--watch] [--init]`

* **SCSS compiler**:

    * `valet scss [config] [--watch]`
    * `valet scss-init`

---

## Local domain management (Windows + Apache)

Valet writes labeled blocks to both the **hosts** and **Apache vhosts** files using markers, and restarts Apache when it changes the vhosts file.

**Marker per domain**

```
## domain: <your-domain>----
... (managed content) ...
####
```

**VirtualHost example**

```apache
<VirtualHost my-site.test>
  DocumentRoot "C:\path\to\project"
  ServerName my-site.test
  ServerAlias *.my-site.test
  <Directory "C:\path\to\project">
    Require local
  </Directory>
</VirtualHost>
```

**Commands**

* Install current folder as `<folder>.test`:

  ```bash
  valet install
  # options: --domain <name>  --path <dir>
  ```
* Update an entry (path/name):

  ```bash
  valet update --domain my-app.test --path C:\dev\my-app
  ```
* List, format, remove:

  ```bash
  valet list
  valet list --format -1         # edit the last entry
  valet list --remove 2 3        # delete by index (supports negative indices)
  ```
* Delete:

  ```bash
  valet del -d my-app.test [--path C:\dev\my-app]
  ```

> **Note**: Writing to system files usually requires an elevated shell (Run as Administrator).

---

## CSR: Color + media pipeline (`csr.json`)

The CSR pipeline turns a **single config** into concrete **design tokens** that your app can consume. It:

* Parses a **color source** (SCSS/JSON/JS) into CSS Custom Properties.
* Emits a Tailwind‑friendly `@theme { --color-* }` mirror when `type: "tailwind"`.
* Optionally generates **media tokens** (breakpoints → `--bp-*`, and optional SCSS helpers).
* Merges everything into your `outFile` in clearly labeled, idempotent sections.
* Can watch `csr.json` + referenced files and re‑run automatically.

### CSR quick start

**1) Create config**

```bash
valet csr --init .   # writes a starter csr.json
```

**2) Example `csr.json` (from your project)**

```json
{
  "outFile": "./app.css",
  "colors": {
    "scss": "./dist/_colors.scss",
    "css": "./dist/colors.css",
    "source": "./_colors.scss",
    "type": "tailwind",
    "themeKeys": ["dark"],
    "colorFormat": "oklch"
  },
  "media": {
    "breakpoints": {
      "xs": "320px",
      "sm": "360px",
      "md": "768px",
      "lg": "1024px",
      "xl": "1280px",
      "2xl": "1536px",
      "4k": "1920px"
    },
    "outDir": "./dist",
    "filename": "_mediaQuery.scss",
    "type": "tailwind",
    "useSass": false
  },
  "extra": {
    "font": { "sans": "'Inter, sans-serif'", "secondary": "Roboto, sans-serif" },
    "radius": { "default": "0.25rem", "sm": "0.125rem", "lg": "0.5rem", "full": "9999px" }
  },
  "watch": false
}
```

**3) Provide a color source** (SCSS sample)

```scss
@use "sass:map";

$theme-default: #129ea3;
$theme-colors: (
  50: #f0fdfc, 100: #cdfaf6, 200: #9bf4ee, 300: #61e7e3, 400: #31d0d0,
  500: #18b2b4, 600: $theme-default, 700: #117074, 800: #13575c,
  900: #144a4d, 950: #052a2e,
  default: $theme-default,
  foreground: black,
);

$destructive: (
  50: #fef3f2, 100: #fde5e3, 200: #fccfcc, 300: #f9ada8, 400: #f37d76,
  500: #e6443a, 600: #d5372d, 700: #b32a22, 800: #942720,
  900: #7b2621, 950: #430f0c,
  default: #e6443a,
  foreground: #fcfcfc,
);

$colors: (
  #theme: $theme-colors,
  background: (
    default: oklch(0.98 0.015 190),
    --dark-default: oklch(0.15 0.02 210),
    #main: map.get($theme-colors, 50)
  ),
  foreground: oklch(0.19 0.03 210),
  destructive: $destructive,
  #primary: map.get($theme-colors, 500),
  chart: (
    1: oklch(0.64 0.12 190),
    2: oklch(0.70 0.10 165),
    3: oklch(0.58 0.09 210),
    4: oklch(0.80 0.14 85),
    nest: (
      first: red,
      "!deep": (
        second: blue,
        third: green,
        --dark-third: yellow
      ),
    ),
    5: oklch(0.74 0.13 35),
    --dark-5: black
  ),
  #sidebar: (...),
  #strokes: (...),
  #surfaces: (...),
  #tones: (...),
  #secondary: (...),
  #muted: (...),
  #accent: (
    default: oklch(0.95 0.03 180),
    foreground: oklch(0.28 0.03 210),
    --dark-foreground: oklch(0.90 0.02 200)
  )
);
```

**4) Run it**

```bash
valet csr .          # generate/merge tokens into app.css
valet csr . --watch  # keep in sync as you edit csr.json or the source files
```

### Color map → tokens (mapping rules)

* **Top‑level `$colors`** drives everything.
* **Groups** use `#group: (...)` → becomes `--group-*` in CSS.

    * `default` → `--group`
    * `foreground` → `--group-foreground`
    * numeric keys (`50`, `500`, …) → `--group-50`, `--group-500`, …
    * nested keys concatenate: `#sidebar.primary-foreground` → `--sidebar-primary-foreground`
* **Scalars** become simple vars: `foreground: oklch(...)` → `--foreground`
* **Aliases/promotions**: `#primary: map.get($theme-colors, 500)` → `--primary`
* **References** are preserved: `var(--border)`, etc.
* **Color normalization**: everything that looks like a color is normalized to the configured `colorFormat` (e.g., `oklch`).

### Theme overrides (`themeKeys`)

* Declare which themes you support in `themeKeys` (e.g., `["dark"]`).
* Inside a group, any `--<theme>-<token>` key **overrides** that token under the corresponding theme class:

    * `background > --dark-default` → `.dark { --background: ... }`
    * `chart > --dark-5` → `.dark { --chart-5: ... }`
    * `#accent > --dark-foreground` → `.dark { --accent-foreground: ... }`
* Only keys for the themes you list are emitted; other themes are ignored.

### Private branches with `!`

* Any map key starting with `!` (e.g., `"!deep"`) is **private to the CSS vars** layer:

    * Its descendants are **written to `:root`/theme classes** (names include the segment without `!`, e.g., `deep`).
    * **They are not mirrored** into the Tailwind `@theme { --color-* }` block.
* Example:

  ```scss
  chart: (
    nest: (
      "!deep": ( second: blue )
    )
  )
  ```

  produces `--chart-nest-deep-second` in `:root`, but **no** `--color-chart-nest-deep-second` in `@theme`.

### Media tokens

* With `useSass: false`, breakpoints become CSS vars:

  ```css
  :root {
    --bp-xs: 320px; --bp-sm: 360px; --bp-md: 768px; /* ... */
  }
  ```

  Use them directly:

  ```css
  @media (min-width: var(--bp-lg)) { .card { padding: 2rem; } }
  ```
* With `useSass: true`, the pipeline also writes an SCSS file (e.g., `dist/_mediaQuery.scss`) exposing `$breakpoints` and mixins like `@include mq('lg') { ... }`.

### Extras

* `extra` can be an **object** (merged into `:root`) or a **path** to a JS/TS module exporting a default object.
* Object keys are converted to CSS vars using a predictable scheme:

    * `font.sans` → `--font-sans`
    * `radius.default` → `--radius`
    * `radius.sm` → `--radius-sm`

### Watching & dynamic reloading

With `--watch`, Valet watches:

* `csr.json` (or `configPath`),
* `colors.source`,
* `extra` **if it is a string path**.

When files change, the config is reloaded, the watch set is updated (if paths changed), and tokens are regenerated/merged.

### CSR usage cheatsheet

* **Run**: `valet csr .` → writes/updates sections inside `app.css`.
* **Themes**: set `themeKeys` (e.g., `["dark"]`) and use `--dark-<token>` overrides within groups.
* **Private branches**: prefix a key with `!` to **exclude its subtree** from the `@theme` mirror while still writing CSS vars to `:root`/themes.
* **Media**: use `--bp-*` CSS vars or SCSS mixins if enabled.
* **Extras**: provide arbitrary tokens via `extra` object or file path.
* **Idempotent merge**: your custom CSS outside the generated sections is preserved.

---

## SCSS compiler (`scss.config.json`)

A focused SCSS → CSS compiler with quality‑of‑life features for real‑world projects.

* **Path beacon** `&<...>` resolves to the right relative path from the current file to your SCSS root.
* **`additionalData`** can be a global string or **rules** that inject SCSS per file via includes/excludes/files.
* **Safe reordering** of top‑level `@forward/@use/@import` to avoid Sass ordering errors.
* **Lightning CSS** minify/targets integration (auto‑skips when Tailwind directives detected).
* Debounced **watcher**; partials (`_*.scss`) trigger a full rebuild.

### SCSS quick start

**1) Create a config**

```bash
valet scss-init   # writes ./scss.config.json
```

**2) Minimal `scss.config.json`**

```json
{
  "$schema": "https://timeax.dev/schemas/scss-compiler.config.schema.json",
  "source": "./scss",
  "out": "./dist",
  "additionalData": [
    { "value": "@use \"&<tokens/colors>\" as *;", "includes": "**/*.scss" }
  ],
  "minify": false,
  "lightningCss": true,
  "ignore": ["_*.scss", "ignore.scss", "ignored-folder/"],
  "root": "./scss",
  "beaconPrefix": "&",
  "reorder": "on"
}
```

**3) Use the beacon** inside SCSS

```scss
// components/button.scss
@use "&<tokens/colors>" as *;  // resolves correctly from this file to /scss/tokens/_colors.scss
.button { color: var(--brand); }
```

**4) Compile**

```bash
valet scss            # compile once using ./scss.config.json
valet scss --watch    # recompile on change (partials trigger full rebuild)
```

### Path beacon `&<...>`

* Write `@use "&<path/to/file>"` from **anywhere**; the compiler rewrites it to a correct relative path from the current file to `config.root` (defaults to `source`).
* Escape as `\&<...>` to keep literal text.

### Conditional `additionalData` rules

`additionalData` accepts a string or an array of rules applied **in order**:

```json
{
  "additionalData": [
    {
      "value": "$brand: oklch(65% 0.2 280);",
      "includes": ["**/*.scss"],
      "excludes": ["legacy/**"]
    },
    {
      "value": "@use \"&<mixins/index>\" as *;",
      "files": ["components/button.scss"]
    }
  ]
}
```

* `includes`: glob(s) relative to `source` (if present, must match).
* `excludes`: glob(s) that prevent application.
* `files`: exact relative paths that **force include** the rule even if excluded.

### Safe import reordering

Only top‑level `@forward/@use/@import` are lifted to the top of the file — content inside blocks (e.g., `@layer {}`) is left untouched. This prevents common Sass ordering errors when injecting globals.

### Lightning CSS integration

* If `targets` is empty/omitted and Lightning CSS is available, the compiler infers targets from Browserslist (e.g., `>= 0.25%`).
* If the compiled CSS **still contains Tailwind directives** (`@tailwind`, `@apply`, Tailwind `@layer`), the compiler **skips Lightning CSS** for that file to avoid breaking them.
* **Best practice**: if you want Lightning minification on the final CSS, run it **after** Tailwind/PostCSS in your pipeline.

### Watcher behavior

* Debounced per‑file compile on change.
* Partials (`_*.scss`) trigger a **full rebuild** (safe default without a dependency graph).
* When watching a config path, changes to the config hot‑reload and **rebalance the watched set** (e.g., if `source` or `ignore` change).

---

## Configuration reference

### `csr.json`

* `outFile: string` — destination CSS file to merge tokens into.
* `colors?: {
    source: string;        // SCSS/JSON/JS source file for colors
    scss?: string;         // optional SCSS output (variables/helpers)
    css?: string;          // optional standalone CSS output for colors
    type?: "tailwind" | "variables";  // Tailwind adds @theme mirror
    themeKeys?: string[];  // e.g., ["dark"]
    colorFormat?: "hex" | "rgb" | "rgba" | "oklch";
  }`
* `media?: {
    breakpoints?: Record<string,string>;
    outDir?: string;
    filename?: string;
    type?: "variables" | "tailwind" | "none"; // default "tailwind"
    useSass?: boolean;     // also write SCSS helpers
  }`
* `extra?: object | string` — object or path to a JS/TS module that `export default`s the object.
* `watch?: boolean` — default false; use CLI flag `--watch` to enable.

### `scss.config.json`

* `source: string` — SCSS source directory
* `out: string` — output directory for compiled CSS
* `additionalData: string | Array<Rule>` — per‑file SCSS injection

    * `Rule`: `{ value: string; includes?: Glob; excludes?: Glob; files?: string[] }`
* `targets?: Record<string, number>` — Lightning CSS targets; inferred if missing
* `minify: boolean` — minify via Lightning CSS
* `lightningCss: boolean` — enable Lightning CSS transforms
* `ignore: string[]` — direct filenames, folder paths ending in `/`, simple `*` wildcards
* `root?: string` — resolution root for `&<...>` (defaults to `source`)
* `beaconPrefix?: string` — beacon prefix (default `&`)
* `reorder?: "on" | "off"` — reorder top‑level loads

---

## Tips & troubleshooting

* **Admin rights**: open the terminal as Administrator for domain commands.
* **Apache service name**: the restart command targets `Apache2.4`. If yours differs, restart manually or rename the service.
* **Windows paths**: override with `HOSTS/DRIVE` and `VP/VD` env vars.
* **Tailwind projects**: run Sass → Tailwind/PostCSS → Lightning CSS, or let the SCSS compiler auto‑skip Lightning when Tailwind directives are present.
* **Partials**: changing `_*.scss` triggers a full rebuild to avoid stale dependencies.
* **Idempotent merges**: the CSR pipeline updates only its managed sections; your other CSS remains intact.

---

## Development & scripts

**package.json scripts**

```bash
npm run start            # tsc -w in src
npm run build            # rebuild dist and copy resources
npm run copy             # helper for copying query.txt resource
npm run prepublishOnly   # build and bump patch version
npm run test             # e.g., valet colors ./sass/_colors.scss --watch=true
npm run download         # install latest globally
```

**Project layout**

* `src/index.ts` — CLI entry: domains + command registration (`scss`, `csr`)
* `src/sass-to-lightening` — SCSS compiler command & helpers
* `src/csr` — CSR pipeline & watchers
* `src/color` — color processing helpers
* `src/media` — responsive token generator
* `src/utils` — theme merging, color formatting, sass helpers

**License**
ISC
