# How To Use EMS

This is the current development workflow. Verify EMS only in a dedicated Chrome test profile, not in your default personal Chrome profile.

## Quick Flow

1. Open `chrome://extensions` in the Chrome test profile.
2. Turn on `Developer mode`.
3. Click `Load unpacked` and select this repo's `ems-extension` folder.
4. Open the site you want to test. Example: `https://www.youtube.com/watch?v=pa4Xo-LQe54`
5. Open the EMS popup and review the extension list, relevance labels, and `Measured Memory Impact` values.

## Import Profile Inventory

Profile inventory enriches site relevance with manifest signals that the stable Chrome runtime API does not expose directly, especially `content_scripts.matches` and `optional_host_permissions`.

Run this from the repo root in PowerShell:

```powershell
.\tools\Export-EMSProfileInventory.ps1 -ProfileDir "C:\Users\lcmru\AppData\Local\Google\Chrome\User Data\Profile 5"
```

The default output file is:

```text
test-results\profile-inventory.json
```

Then open the EMS popup, click `Import JSON`, and select that JSON file.

## Reading Memory Values

`Measured Memory Impact` is not exact live memory ownership. It is an A/B scenario delta measured by the EMS probe after removing an extension under the same site and test conditions.

The practical reading is:

- `Measured Memory Impact`: estimated memory drop observed when that extension was removed
- `renderer / total`: renderer private-memory drop and total Chrome private-memory drop
- `impact: low / medium / high`: label derived from the measured delta

So this is not a perfect live ownership meter, but it is the closest practical signal for "what memory is likely to drop if I disable this extension."

## Main Buttons

- `Lighten This Site`: disables likely site-relevant extensions browser-wide.
- `Restore Previous State`: restores the extension states saved before the last `Lighten This Site`.
- `Save Current Setup`: saves the currently enabled extension set for the current site.
- `Apply Saved Setup`: applies the saved set to the current browser extension state.
- `Clear Saved Setup`: deletes the saved setup for the current site.
- `Import JSON`: imports benchmark labels or profile-inventory JSON.
- `Reset Defaults`: restores seeded benchmark labels and clears imported manifest signals.

## Warning

Enable, Disable, Lighten, Restore, and Apply are not tab-only actions. Chrome extension state changes apply browser-wide.
