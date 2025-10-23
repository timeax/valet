# Valet — Windows Web Dev Utility CLI

Valet is a Windows-focused developer CLI for:

1. **Local domains** on Windows (hosts + Apache vhosts with safe markers and auto-restart).
2. **CSR pipeline**: generate & merge design tokens (colors + media + extras) into your app CSS from `csr.json`, with Tailwind support and a file watcher.
3. **SCSS compiler**: compile SCSS → CSS with optional Lightning CSS optimization, safe import reordering, per-file injected rules, a path beacon, and a watcher.

---

## Table of contents

* [Prerequisites & environment](#prerequisites--environment)
* [Install](#install)
* [CLI overview](#cli-overview)
* [Local domain management](#local-domain-management)
* [CSR pipeline](#csr-pipeline)

    * [Quick start](#quick-start)
    * [Colors — authoritative rules](#colors--authoritative-rules)
    * [Media tokens](#media-tokens)
    * [Extras](#extras)
    * [Watching & dynamic reloading](#watching--dynamic-reloading)
    * [CSR cheatsheet](#csr-cheatsheet)
* [SCSS compiler](#scss-compiler)

    * [Quick start](#quick-start-1)
    * [Beacon `&<...>`](#beacon-)
    * [Conditional additionalData rules](#conditional-additionaldata-rules)
    * [Safe import reordering](#safe-import-reordering)
    * [Lightning CSS integration](#lightning-css-integration)
    * [Watch behavior](#watch-behavior)
* [Configuration reference](#configuration-reference)
* [Tips & troubleshooting](#tips--troubleshooting)
* [Development & scripts](#development--scripts)
* [License](#license)

---

## Prerequisites & environment

* **Windows** (paths and service names assume Windows).
* **Apache httpd** (e.g., XAMPP). Valet restarts Apache via:

  ```bash
  httpd -k restart -n "Apache2.4"
  ```

  If the service name differs, restart manually or rename the service.
* **Permissions**: write access to the hosts and vhosts files.
* **Node.js 18+** recommended.

**Environment overrides**

* `HOSTS`: absolute path to hosts file (default `C:\Windows\System32\drivers\etc\hosts`)
* `DRIVE`: drive letter prefix when `HOSTS` is unset (e.g., `D:`)
* `VP`: absolute path to Apache vhosts file (default `D:\xampp\apache\conf\extra\httpd-vhosts.conf`)
* `VD`: drive letter prefix when `VP` is unset

---

## Install

```bash
npm i -g @timeax/valet          # install
npm i -g @timeax/valet@latest   # update
```

Binary: `valet` (main script: `dist/index.js`). Run `valet --help` any time.

---

## CLI overview

* **Domains** (Windows + Apache)

    * `valet install` / `valet i`
    * `valet update`
    * `valet list` / `valet l`
    * `valet del`

* **CSR pipeline**

    * `valet csr [sourceDir] [--watch] [--init]`

* **SCSS compiler**

    * `valet scss [config] [--watch]`
    * `valet scss-init`

---

## Local domain management

Valet writes labeled blocks into both the **hosts** and **Apache vhosts** files and restarts Apache after vhosts changes.

**Markers**

```
## domain: <your-domain>----
... (managed content) ...
####
```

**VirtualHost example**

```apache
<VirtualHost my-site.test>
  DocumentRoot "C:\dev\my-site"
  ServerName my-site.test
  ServerAlias *.my-site.test
  <Directory "C:\dev\my-site">
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
  valet list --format -1      # edit the last entry
  valet list --remove 1 2     # delete by index (supports negative indices)
  ```
* Delete:

  ```bash
  valet del -d my-app.test [--path C:\dev\my-app]
  ```

> Use an elevated shell (Run as Administrator) for domain commands.

---

## CSR pipeline

Generates **design tokens** from a color source and optional media + extras, then merges them into `outFile` (`app.css` or similar). With `type: "tailwind"`, writes a Tailwind-friendly `@theme { --* }` mirror.

### Quick start

```bash
valet csr --init   # create csr.json with defaults
valet csr          # run once
valet csr --watch  # watch csr.json and referenced files
```

**Example `csr.json`**

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
      "xs": "320px", "sm": "360px", "md": "768px",
      "lg": "1024px", "xl": "1280px", "2xl": "1536px", "4k": "1920px"
    },
    "outDir": "./dist",
    "filename": "_mediaQuery.scss",
    "type": "tailwind",
    "useSass": false
  },
  "extra": {
    "font": { "sans": "'Inter, sans-serif'", "secondary": "Roboto, sans-serif" },
    "radius": { "default": "0.25rem", "sm": "0.125rem", "lg": "0.5rem", "full": "9999px" }
  }
}
```

### Colors — authoritative rules

**Core rules**

* **Everything is added to the `@theme` block by default.**
  The only exception is anything under a key prefixed with `!` → **excluded from `@theme`**.

* **`#` (hash) marks a subtree for `:root`.**
  Tokens with `#` ancestry are emitted to `:root`. In `@theme`, those tokens are referenced as `var(--…)` **instead of direct values**.

* **`!` (bang) opts out of `@theme` for that subtree.**
  It does not inherently remove `:root` eligibility; if the subtree sits under `#`, it can still appear in `:root` while remaining **absent from `@theme`**.

* **Theme overrides force-promote to `:root`.**
  A key like `--<theme>-<token>`:

    * Ensures the corresponding base token exists in `:root` (promoted if needed).
    * Writes the themed override under `.<theme>`.
    * Does **not** override `!`: if a token lives under `!`, it still won’t be mirrored into `@theme`.

**SCSS map shape**

```scss
$colors: (
  #group: ( ... ),           // grouped tokens → eligible for :root; @theme uses var(--…)
  scalarName: <color>,       // ungrouped → not in :root by default; still appears in @theme (direct value)
  #aliasName: <value>        // top-level alias → :root + @theme via var(--…)
);
```

**Naming**

* Join path segments with `-`; strip leading `#`/`!`.
* Group specials: `default` → base var; `foreground` → `-foreground`; numeric keys → `-50`, `-500`, …

**Worked example**

*Input*

```scss
$colors: (
  #theme: (50: #f0fdfc, 500: #18b2b4, default: #18b2b4, foreground: black),

  background: (
    default: oklch(0.98 0.015 190),
    --dark-default: oklch(0.15 0.02 210)
  ),

  #chart: (
    nest: (
      first: red,
      "!deep": (
        second: blue,
        third: green,
        --dark-third: yellow
      )
    )
  )
);
```

*Output (abridged)*

```css
:root {
  /* from #theme */
  --theme-50: ...;
  --theme-500: ...;
  --theme: ...;
  --theme-foreground: ...;

  /* background: force-promoted by --dark-default */
  --background: oklch(0.98 0.015 190);

  /* #chart lineage is eligible for :root, even under ! */
  --chart-nest-first: red;
  --chart-nest-deep-second: blue;   /* under !deep but still in :root (parent #chart) */
  --chart-nest-deep-third: green;
}

.dark {
  --background: oklch(0.15 0.02 210);
  --chart-nest-deep-third: yellow;
}

@theme {
  /* #theme → reference var(--…) */
  --color-theme-50: var(--theme-50);
  --color-theme-500: var(--theme-500);
  --color-theme: var(--theme);
  --color-theme-foreground: var(--theme-foreground);

  /* background promoted → reference var(--background) */
  --color-background: var(--background);

  /* #chart.nest.first → reference var(--…) */
  --color-chart-nest-first: var(--chart-nest-first);

  /* tokens under ! are excluded from @theme */
  /* no --color-chart-nest-deep-second / deep-third here */
}
```

**Unprefixed properties (plain keys)**

* **In `@theme`**: always included (direct values), unless excluded by `!`.
* **In `:root`**: not included unless:

    * they have `#` ancestry, or
    * they’re force-promoted via `--<theme>-<token>`.

**Theme overrides**

* For each `--<theme>-<token>` where `<theme>` is listed in `themeKeys`:

    * Ensure base `--…-<token>` exists in `:root` (promote if necessary).
    * Write the override under `.<theme>`.
    * Respect `!`: tokens under `!` are still not mirrored into `@theme`.

**Color normalization (`colorFormat`)**

* Normalizes color-like values on write (e.g., `oklch`). Non-color strings (e.g., `var(--x)`) are preserved.

### Media tokens

* **Default (type: `"tailwind"`)**
  Breakpoints are written to **`@theme` as Tailwind breakpoints** (e.g., `--breakpoint-lg` etc.).
  **No entries are written to `:root`.**

* **`useSass`**

    * `useSass: false` → **no SCSS file** is written.
    * `useSass: true` → additionally write an SCSS helper file (e.g., `$breakpoints` + mixins).
      This flag **only** controls writing the SCSS file; it **does not** affect `:root`.

> If a non-Tailwind mode is desired (e.g., writing `:root` custom properties), set `type: "variables"` in `media` (if supported in your build; otherwise leave as `"tailwind"`).

### Extras

* `extra` may be an object or a path to a JS/TS module that `export default`s the object.
* Keys are converted to CSS vars in `@theme` and/or merged into `outFile` as configured by the pipeline. Common mappings:

    * `font.sans` → `--font-sans`
    * `radius.default` → `--radius`
    * `radius.sm` → `--radius-sm`

### Watching & dynamic reloading

With `--watch`, the CSR command watches:

* `csr.json` (or `configPath`),
* `colors.source`,
* `extra` **if it is a string path**.

On changes, the config is reloaded, the watch set updates if paths changed, and tokens are regenerated.

### CSR cheatsheet

* **Everything goes into `@theme`** unless the key is under `!`.
* **`#`** → also emit to `:root`. In `@theme`, reference with `var(--…)`.
* **Plain (unprefixed)** → included in `@theme` as **direct values**; not in `:root` unless promoted or under `#`.
* **`!`** → exclude subtree from `@theme` (still allowed in `:root` if under `#` or promoted).
* **`--<theme>-<token>`** → force-promote base into `:root` and write `.<theme>` override; still respect `!` for `@theme`.

---

## SCSS compiler

Compile SCSS to CSS with practical features:

* Path **beacon** `&<...>` for robust cross-file `@use`/`@import` from any depth.
* **additionalData** rules for per-file injections (string or rule array).
* Safe **reordering** of top-level `@forward/@use/@import`.
* **Lightning CSS** minify/targets integration, with automatic Tailwind-safe skipping.
* Debounced **watcher**; partials trigger a full rebuild.

### Quick start

```bash
valet scss-init        # create ./scss.config.json
valet scss             # compile once
valet scss --watch     # recompile on change
```

**Example `scss.config.json`**

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

### Beacon `&<...>`

Write `@use "&<path/to/module>"` from any file under `source`. The compiler rewrites it to the correct relative path from the current file to `root` (defaults to `source`). Escape as `\&<...>` to keep literal text.

### Conditional additionalData rules

`additionalData` can be a string or an ordered array of rules:

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

* `includes`: glob(s) relative to `source`.
* `excludes`: glob(s) to omit.
* `files`: exact relative paths that force-apply the rule.

### Safe import reordering

Only **top-level** `@forward/@use/@import` are lifted to the top of the file. Content inside blocks (`@layer`, selectors, nested rules) remains in place. This avoids Sass ordering issues when injecting globals.

### Lightning CSS integration

* If `targets` is empty/omitted and Lightning CSS is available, targets are inferred from Browserslist.
* If the compiled CSS still contains Tailwind directives (`@tailwind`, `@apply`, Tailwind `@layer`), Lightning CSS is **skipped** for that file.
* For final minification, place Lightning CSS **after** Tailwind/PostCSS in the build pipeline.

### Watch behavior

* Changes to normal `.scss` files trigger per-file recompiles (debounced).
* Changes to partials (`_*.scss`) trigger a **full rebuild**.
* When watching a config path, edits hot-reload the config and **rebalance** the watched set (e.g., if `source` changes).

---

## Configuration reference

### `csr.json`

* `outFile: string` — destination CSS file to merge tokens into.
* `colors?: {`

    * `source: string;`         // SCSS/JSON/JS color source
    * `scss?: string;`          // optional SCSS helper output
    * `css?: string;`           // optional standalone CSS output
    * `type?: "tailwind" | "variables";`
    * `themeKeys?: string[];`   // e.g., ["dark"]
    * `colorFormat?: "hex" | "rgb" | "rgba" | "oklch";`
      `}`
* `media?: {`

    * `breakpoints?: Record<string,string>;`
    * `outDir?: string;`
    * `filename?: string;`
    * `type?: "tailwind" | "variables" | "none";`  // default "tailwind"
    * `useSass?: boolean;`       // only controls writing the SCSS file
      `}`
* `extra?: object | string` — object or path to a JS/TS module exporting a default object.

### `scss.config.json`

* `source: string` — SCSS source directory
* `out: string` — CSS output directory
* `additionalData: string | Array<Rule>`

    * `Rule`: `{ value: string; includes?: Glob|Glob[]; excludes?: Glob|Glob[]; files?: string[] }`
* `targets?: Record<string, number>` — Lightning CSS targets; inferred if missing
* `minify: boolean` — enable Lightning minification
* `lightningCss: boolean` — enable Lightning transforms
* `ignore: string[]` — filenames, folders ending with `/`, simple `*` wildcards
* `root?: string` — resolution root for `&<...>` (defaults to `source`)
* `beaconPrefix?: string` — prefix for beacon tokens (default `&`)
* `reorder?: "on" | "off"` — reorder top-level loads

---

## Tips & troubleshooting

* **Admin rights** are needed for domain commands.
* **Apache service name**: the restart targets `Apache2.4`. If different, restart manually or rename the service.
* **Paths** can be overridden with `HOSTS/DRIVE` and `VP/VD`.
* **Tailwind integration**: run `Sass → Tailwind/PostCSS → Lightning CSS` to safely minify final CSS.
* **Idempotent merges**: CSR updates only its labeled sections; custom CSS remains intact.
* **Partials**: modifying `_*.scss` triggers a full rebuild (no dependency graph).

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

---

## License

ISC
