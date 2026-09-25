# Licensing and attribution

Every bundled asset must appear in the content manifest with a source URL, a
version/hash, a `license_id` from `licenses/registry.json`, and an attribution
string. The pipeline fails the build when any of those is missing, when a
license id is unknown, or when a URL matches the distribution deny-list.

**The app is fully offline and ships only redistributable content.**
Captain decision 2026-09-25: no Quran Foundation content, no runtime Content
API/OAuth/token-broker path, and no English translation.

## What the bundle ships

| Asset | Source | License | Key obligations |
|---|---|---|---|
| Quran text (Uthmani v1.1) + metadata | Tanzil Project | `cc-by-3.0` | Verbatim only; credit Tanzil and link tanzil.net; ship the notice (`TANZIL-NOTICE.txt`) |
| English transliteration (ayah lines) | Tanzil translation edition `en.transliteration` | `tanzil-transliteration-permission` | Field-cleared by a written grant held by the captain; credit Tanzil and link tanzil.net |
| Word timings for 11 recitations | `cpfair/quran-align` release 2016-11-24 | `cc-by-4.0-quran-align` | Credit Collin Fair / cpfair/quran-align, link the repo and CC BY 4.0, state that malformed entries were repaired |
| Word-level transliteration | Derived from the Tanzil transliteration line by whitespace splitting (schema `words`) | same as the transliteration | No new rights holder; the split is the captain-mandated derivation |

Not shipped, on purpose:

- **Recitation audio** — candidates exist, but captain decision CD-2 requires
  Quran Foundation's written confirmation; all entries in
  `config/reciters.json` are `enabled: false` and the audio manifest lists them
  under `pending_reciter_candidates` with no files.
- **English translation** — dropped; the `translations` tables stay reserved
  and empty.
- **Islamic Network / alquran.cloud** — documented fallback only, off.
- **fawazahmed and ummahapi** — deliberately not used. fawazahmed only mirrors
  Tanzil and its repository Unlicense does not cover the content; ummahapi is
  Quran-Foundation-derived and cannot be bundled offline.

## The Tanzil transliteration grant

The captain confirmed in writing that the Tanzil English transliteration is
**CLEARED by written permission** and that the grant is held in the captain's
records (inbox 002, 2026-09-25). `licenses/registry.json` records it as
`tanzil-transliteration-permission` with the grant metadata and the exact
attribution line; `licenses/notices/tanzil-transliteration-en.transliteration.txt`
holds the upstream provenance block that the pipeline re-verifies on every
build. The grant document itself is intentionally not committed to this
repository; keep it with the content manifest for store review.

## quran-align data quality

The 2016-11-24 release contains 12 recitation files:

- The `Abdurrahmaan_As-Sudais_192kbps.json` file is a three-line align-tool
  crash log, not JSON. It is excluded in `config/word_timing.json` with its
  sha256 recorded; nothing is fabricated for it. Eleven recitations are wired.
- The remaining files contain a small number of malformed segments (reversed
  start/end, zero-length, out-of-range, time inversions) and two ayahs with no
  segments at all. The pipeline repairs these deterministically and records the
  counts per recitation in `audio-manifest.json` and `build-report.json`
  (`alignment_repairs`). No repair moves a token across a word boundary.
- Times are offsets **within each ayah's own audio file** (EveryAyah-style
  reference), not within a chapter file. The app must use them with per-ayah
  audio.

## Policy rules enforced by the pipeline

1. **Tanzil text is immutable.** Stored verbatim; the upstream copyright notice
   is compared with `licenses/notices/tanzil-quran-text-1.1-notice.txt` on
   every build and a changed notice fails the build.
2. **Tanzil transliteration is not modified.** The pipeline strips the page's
   presentation markup only and re-verifies the provenance header against
   `licenses/notices/tanzil-transliteration-en.transliteration.txt`.
3. **QuranicAudio is banned.** `quranicaudio.com` is in
   `config/sources.json` under `policy.deny_hosts`; `validate.py` and
   `verify` fail if any URL matches.
4. **Reciter admission requires written confirmation.** `config/reciters.json`
   entries must declare `enabled` explicitly, and only after Quran Foundation
   confirms the source in writing. Once enabled, the pipeline still
   machine-checks the item's declared license on every build.
5. **Fallback sources stay off.** Config validation rejects an enabled entry in
   `fallback_sources`.
6. **No secrets.** There is no Quran Foundation client id/secret handling left
   in the pipeline at all.

## Residual risks to review before publishing

1. **Uploader-declared rights** (the unreleased audio candidates): even with
   the QF-confirmation gate, the recordings' publishers remain the ultimate
   rightsholders; keep the written confirmations on file with the manifest.
2. **Tanzil grant scope.** The written grant covers bundling the
   `en.transliteration` edition; if the app later changes how the
   transliteration is presented or exported, re-check the grant.
3. **quran-align repair accuracy.** Repairs are deterministic and counted, but
   two ayahs per affected recitation are synthesised from the recitation's
   average word duration; the app should treat those as approximate.
4. **Transliteration sensitivities.** Label transliteration as transliteration,
   not scripture, and keep the scholar/community review step before launch
   (report risk R5).
