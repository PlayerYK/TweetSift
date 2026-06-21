# Development Notes

This note tracks project-level maintenance decisions. Implementation details are documented in [Developer Guide](DEVELOPER-GUIDE.md); private exported user data should still stay out of the repository.

## Current Status

TweetSift is a local-first Chrome MV3 extension for fast Twitter/X bookmark folder triage.

Current core behavior:

- `1` saves to Nano.
- `2` saves to Video.
- `3` saves to Image.
- `` ` `` accepts the current recommendation.
- `z` removes the current post from bookmarks.
- The popup can export selected bookmark folders to JSON.

## Open Source Cleanup

Completed before public release:

- Removed local exported tweet JSON samples from `docs/`.
- Added ignore rules for exported/private tweet data.
- Replaced internal debugging notes with public-facing documentation.
- Removed unused background API/auth modules from the early implementation.
- Removed unused `cookies` and `activeTab` permissions from the manifest.
- Added an MIT license.
- Added `docs/DEVELOPER-GUIDE.md` with the internal architecture, X operation hash flow, message contracts, export details, and troubleshooting notes.

## Maintenance Rules

- Do not commit exported bookmark JSON, raw debug JSON, screenshots with private account data, or local browser artifacts.
- Keep `README.md` user-facing and concise.
- Keep `docs/DESIGN.md` aligned with the actual shortcut mapping, permissions, storage shape, and export behavior.
- When changing permissions, update both `src/manifest.json` and the README privacy section.
- When changing export fields, update the README export/privacy notes.

## Release Checklist

1. Run `npm install` when dependencies change.
2. Run `npm run build`.
3. Load `dist/` in Chrome Developer Mode.
4. Verify shortcuts on `x.com`.
5. Verify popup API status and folder export.
6. Check `git status --short --ignored` for private or generated files before committing.

## Known Fragile Areas

- X web DOM selectors and GraphQL response shapes can change.
- Captured operation hashes can expire when X deploys a new web client.
- Bookmark folder access depends on the user's X account features.
- Exported JSON can contain private bookmark context and should be treated as user data.
