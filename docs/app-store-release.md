# App Store Release

A release is a git tag, and the tag is the last human act. `.github/workflows/release.yml` does
the rest unattended: it guards the version, archives, uploads, submits for review, and the build
goes on sale the moment Apple approves it. A version that should not ship on approval is a
version that should not have been tagged.

Screenshots are the one exception, and they are deliberate: see
[Regenerating the screenshots](#regenerating-the-screenshots). A new version inherits the ones
already on the listing, so a release that does not change the interface needs nothing.

## Releasing

1. Write the release notes in English under `## Unreleased` in `CHANGELOG.md`, then the French
   translation under `## Unreleased` in `CHANGELOG.fr.md`. These notes are what the store shows
   under "What's New", so they are written for whoever taps it, not for the team: what earns a
   line and what stays in the git history is
   [changelog-best-practices.md](./changelog-best-practices.md). The French file is the one the
   pipeline reads.
2. Rename `## Unreleased` to `## <version> (<YYYY.MM.DD>)` in **both** files. There is no CI
   date stamp; versioning is manual, and the pipeline refuses to run while an `## Unreleased`
   section remains — the app would otherwise display "Unreleased" as a version title.
3. Set `MARKETING_VERSION` in `ios/Shuhari.xcodeproj/project.pbxproj` to the same version. The
   pipeline refuses a tag that disagrees with it.
4. Push `main`. The Deploy workflow rebuilds `server/system/changelog-content.ts` from
   `CHANGELOG.fr.md`; **without this the in-app changelog stays stale**.
5. Tag and push. The tag is **annotated and carries the release notes**, so the version's
   contents can be read from the tag itself without opening the changelog, and `ios-v` names the
   platform it releases — the workflow only listens to `ios-v*`:
   ```bash
   git tag -a ios-v1.0 -m "$(bun scripts/release-notes.ts markdown 1.0 en)"
   git push origin ios-v1.0
   ```

   In English and as markdown: a tag is read in the repository and on GitHub, both of
   which render it and neither of which speaks the cook's language. The French notes go to
   the store, and nowhere else.

`CURRENT_PROJECT_VERSION` is not edited by hand: the workflow passes the run number, which only
ever grows. App Store Connect rejects a build number it has already seen.

Once the build is delivered, the workflow publishes a **GitHub release** for the tag, carrying
the same section of `CHANGELOG.md` as markdown — headings included, since GitHub renders them
and the store would have printed them. It runs last on purpose: a release announcing a version
that never reached the App Store would be a lie the repository keeps.

## What the listing is made of

The texts live in `fastlane/metadata/` and are overwritten on every release: description,
subtitle, keywords, promotional text, release notes, categories, price. Editing those in App
Store Connect is pointless — the next release wipes them. Change the files, commit, tag.

Three things are **not** pushed by a release, each for its own reason.

**The age rating** and the **privacy declarations** describe the app, not a version, and never
change between releases. The rating is set once on the app's `ageRatingDeclaration`; fastlane's
rating config cannot express the attributes Apple now requires (`advertising`,
`messagingAndChat`, `lootBox`, `ageAssurance`, `parentalControls`, `userGeneratedContent`,
`gunsOrOtherWeapons`, `healthOrWellnessTopics`), and a delivery that omits them is rejected.

**The screenshots** are uploaded by hand. They change when the interface changes, which is not
the rhythm of a release, and producing them in CI cost far more than it returned — the simulator
has to be brought to the front and the app has to have finished drawing, and both failed
silently: a set of home screens, then a set of blank rectangles, reached the listing before
anyone looked at them.

## Regenerating the screenshots

Done deliberately, from a machine where you can see the result:

```bash
xcodebuild -project ios/Shuhari.xcodeproj -scheme Shuhari -configuration Debug \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath build/sim build
scripts/screenshots/capture.sh build/sim/Build/Products/Debug-iphonesimulator/Shuhari.app \
  build/screenshots/raw
bun scripts/screenshots/compose.ts build/screenshots/raw build/screenshots/panels
```

Four panels at **1242×2688** (6.5 inches — the store derives the other iPhone sizes from it),
captions in `scripts/screenshots/panels.json`, design in the CSS of `scripts/screenshots/panel.ts`.
Then **look at them** before uploading.

Three traps the script works around, worth knowing before touching it:

- The simulator build is made in **Debug**. `DebugGallery` sits behind `#if DEBUG`; a Release
  build ignores the `-gallery` argument and every capture returns the same screen.
- Each capture **terminates the app before relaunching it**. `simctl launch` on a running app
  foregrounds it without re-reading its arguments, which silently returns the previous screen.
- A booted simulator with no UI renders nothing: the script opens Simulator.app — or DeviceHub,
  which is what Xcode 27 ships instead — and refuses any capture that matches SpringBoard or
  comes back blank.

## Signing

No certificate is stored anywhere. The workflow authenticates with an App Store Connect API key
(`ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`) and passes `-allowProvisioningUpdates`, so Xcode
fetches the distribution certificate and profile itself.

## Xcode version

The workflow selects the newest Xcode on the runner. Building with anything but the latest final
Xcode triggers **ITMS-90111** (Unsupported SDK or Xcode version) on upload.

## Archiving from the dev Mac instead

Only useful when the pipeline is unavailable. If the dev Mac runs a **beta macOS**, archives get
a prerelease `BuildMachineOSBuild` stamp that App Store validation rejects, also with ITMS-90111.
After archiving, patch it to the latest **public** macOS build number *before* `-exportArchive`
(export re-signs, so the patch survives):

```bash
plutil -replace BuildMachineOSBuild -string '<latest public macOS build>' \
  build/Shuhari.xcarchive/Products/Applications/Shuhari.app/Info.plist
```

Look up the current public macOS build at https://developer.apple.com/news/releases. Verify
`DTXcodeBuild`/`DTSDKBuild` are untouched, then export. CI runners never run a beta macOS, so
this never applies there.

## The pages the App Store demands

A privacy URL and a support URL are mandatory. Both are served by GitHub Pages from
`docs/pages/`, deployed by `.github/workflows/pages.yml`. **The privacy page and the App Store
Connect privacy questionnaire must agree** — a divergence is a common rejection.

## The Terms of Use link, which subscriptions demand

Guideline 3.1.2 requires an app selling auto-renewable subscriptions to carry a **functional link
to the Terms of Use (EULA)** in its metadata, and Apple checks it before anything else — 1.0 was
refused on it, on 2026-07-21, with every subscription in the same submission left stuck at "ready
for review" behind the refused version. Shuhari links Apple's standard EULA rather than writing
one: nothing here departs from it.

The link belongs in **two** places, and both are in the repository:

- the description, at the end of `fastlane/metadata/fr-FR/description.txt`, alongside the privacy
  policy — this is the metadata Apple's automated check reads;
- the paywall, under the subscribe button (`SubscriptionLinks`, shown by `PremiumSheet`) — a
  reviewer who cannot reach the terms from the purchase flow refuses on the same guideline.

Editing the description in App Store Connect alone would be undone by the next release, which
overwrites the listing from `fastlane/metadata/`.

## The Firebase plist, which the archive must contain

`ios/Shuhari/GoogleService-Info.plist` is **committed** — it ships inside every distributed
`.ipa`, so it is public by construction, and the pipeline archives from a clean checkout: while
the file was gitignored, every CI build (12 through 15) left the archive without it and
`FirebaseApp.configure()` aborted at first launch. 1.0 (15) was refused on it, on 2026-07-26,
under guideline 2.1(a) "crash on launch" — a crash no dev machine could reproduce, since the
file exists on all of them. If a resource is required at runtime, it is committed or the
release workflow materializes it; there is no third state.

## Account deletion, which review checks

Guideline 5.1.1(v) requires any app that creates accounts to let them be deleted from within the
app, and reviewers check it on every app that offers Sign in with Apple. Shuhari answers with
Settings → Compte → Supprimer mon compte, wired to the `deleteAccount` mutation
(`server/system/account/`). Do not remove or hide it.
