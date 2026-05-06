# Store Release Prep

This page tracks the release-facing assets and copy for Extension Memory Saver.

## Current Release Identity

- Extension name: Extension Memory Saver
- Short name: EMS
- Version: 0.2.0
- Default shortcut: Ctrl+Shift+E
- Repository: https://github.com/lcm1226/extension-memory-saver

## Chrome Web Store Asset Checklist

Based on Chrome for Developers docs:

- Manifest icons: PNG icons at 16, 32, 48, and 128 px. SVG/WebP are not supported for manifest icons.
- Store icon: 128x128 PNG in the extension ZIP. For square icons, Chrome recommends a 96x96 actual icon with 16 px transparent padding per side.
- Screenshots: at least one screenshot, preferably up to five. Use 1280x800 or 640x400, square corners, no padding.
- Small promo tile: 440x280 PNG or JPEG.
- Marquee promo tile: optional 1400x560 PNG or JPEG.

Official references:

- https://developer.chrome.com/docs/extensions/reference/manifest/icons
- https://developer.chrome.com/docs/extensions/develop/ui/configure-icons
- https://developer.chrome.com/docs/webstore/images/
- https://developer.chrome.com/docs/webstore/cws-dashboard-listing/

## Draft Short Description

Control site-related Chrome extensions and import benchmark-backed memory estimates.

## Draft Detailed Description

Extension Memory Saver helps heavy Chrome users reduce extension overhead without guessing which extensions matter on the current site.

EMS shows your installed extensions, highlights extensions likely relevant to the current site, and lets you save or apply site-specific extension setups. It can import benchmark-backed memory impact data and near-live probe estimates generated from a dedicated test profile.

Important behavior notes:

- Enable, Disable, Lighten, Restore, and Apply change extension state browser-wide, not only in one tab.
- Memory values are practical estimates, not exact live content-script ownership.
- Near-live estimates require the external local probe workflow and should be read with their confidence labels.
- Use a dedicated Chrome test profile for probe workflows.

## Permission Rationale

- management: list installed extensions and enable/disable extensions when Chrome allows it.
- storage: save site setups, benchmark labels, manifest signals, and imported memory estimates locally.
- tabs: read the active tab URL/title so EMS can rank extensions for the current site.

## Privacy Draft

EMS stores data locally through Chrome extension storage. It does not send browsing history, installed extension inventory, benchmark imports, or memory estimates to a remote server. Optional probe JSON files are generated locally by the development/probe workflow and imported manually or written to local extension storage.

## Release Package

Run from repo root:

```powershell
npm run package:extension
```

Expected output:

```text
dist\extension-memory-saver-0.2.0.zip
```

The package script copies only the `ems-extension` folder contents into a staging directory and zips that content.

## Remaining Manual Release Work

- Capture 1-5 store screenshots from the test profile, preferably 1280x800.
- Create optional 440x280 small promo tile and 1400x560 marquee tile.
- Review wording in the Chrome Web Store dashboard before submission.
- Decide whether the first listing should be English-only or include a Korean localized listing.
