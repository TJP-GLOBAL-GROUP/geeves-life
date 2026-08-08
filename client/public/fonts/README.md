# Self-hosted brand fonts

These woff2 files are served by the `@font-face` blocks in
`client/src/styles/fonts.css` (Outfit 300/700, Inter 400/500/600,
JetBrains Mono 400/500).

## Populating this directory

Font binaries are intentionally not committed via the content API. Run:

```bash
bash scripts/fetch-fonts.sh
```

This downloads the exact files from Google Fonts (css2 API →
fonts.gstatic.com) into this directory.

## Licensing

Outfit, Inter, and JetBrains Mono are all licensed under the
SIL Open Font License 1.1 (OFL). Self-hosting, bundling, and serving
the unmodified font files is permitted; retain the license notices if
the fonts are redistributed outside this application.
