# Captain decisions

Product and legal calls that the engineering foundation must not make on its
own. The research report (`/home/dogukan/dev/firstmate/data/quran-app-tech/report.md`,
2026-09-25) opened three; building M0 surfaced three more. Every one is
recorded here rather than silently baked into code. When a decision closes,
update this file in the same commit as the resulting change.

## Resolved by the captain — 2026-09-25 (inbox 002)

The captain named the final sources for transliteration and word timing. Code
and docs were updated to match.

1. **Tanzil English transliteration is cleared by written permission.** Wired
   in as the ayah-level transliteration edition (`tanzil.en.transliteration`)
   with attribution and the grant recorded in `licenses/registry.json`
   (`tanzil-transliteration-permission`) and `docs/licensing.md`. Resolves
   CD-3's transliteration half.
2. **Word-level transliteration is derived by splitting** each ayah line on
   whitespace into per-word tokens (`words` table). `text_uthmani` is set only
   when the token count equals the Uthmani space-split word count; mismatched
   ayahs keep NULL rather than a wrong word.
3. **cpfair/quran-align CC BY 4.0 timings are wired for word highlighting**,
   limited to the recitations the package supports. The 2016-11-24 release
   ships 12 files; the As-Sudais file is an align-tool crash log, so 11 are
   enabled and the 12th is recorded as excluded with its hash. Malformed
   segments are repaired deterministically and counted in the manifest.
   Resolves CD-6.
4. **fawazahmed and ummahapi must not be added**: fawazahmed only mirrors
   Tanzil and its repository Unlicense does not cover the content; ummahapi is
   Quran-Foundation-derived and cannot be bundled offline.
5. **The reciter catalogue stays pending QF written confirmation** (CD-2
   unchanged): `config/reciters.json` entries remain disabled; quran-align
   timings are staged as timing-only recitations with no audio files.
6. **Offline downloads stay** per surah by default with per-preset as an
   option (as decided in inbox 001).

## Resolved by the captain — 2026-09-25 (inbox 001)

The captain's first decision message; the code and docs were updated to match.
These supersede the earlier "foundation defaults".

1. **No English translation.** Pickthall and all QF translation content are
   dropped. The app's reading surface is transliteration/romanization only,
   with Arabic script optional per preset. The schema keeps the
   `translations` / `translation_rows` tables empty and reserved; no translation
   asset is fetched or bundled. Supersedes CD-3's translation half.
2. **No Quran Foundation content and no runtime API path.** The
   OAuth2/legacy client, the token-broker option and the `--require-qf-auth`
   mode are removed from the pipeline. The app is fully offline and ships only
   content that may be redistributed: Tanzil text and rights-cleared audio
   (plus transliteration once cleared). Resolves CD-4.
3. **Offline downloads stay.** Default is per surah; per-preset is an option.
   Encoded in the user schema as `presets.download_scope`
   (`inherit` | `surah` | `preset`) with the app default
   `settings['downloads.scope'] = 'surah'`. Resolves CD-5's download half.
4. **Word highlighting is required.** The schema carries word-level
   transliteration (`words.transliteration`) and per-word timing
   (`segments.word_index >= 1`), and the pipeline reserved a swappable adapter
   seam, disabled at that point. No word data was bundled until a bundleable,
   redistributable source passed the rights review; the sources were named
   later in inbox 002. Updates CD-6.
5. **Reciter catalog gate is Quran Foundation's written confirmation.** All
   Internet Archive candidates are disabled (`enabled: false`,
   `status: pending_written_confirmation`); the pipeline builds zero reciters
   until a written confirmation exists. The Islamic Network / alquran.cloud CDN
   is documented in `config/reciters.json` under `fallback_sources` and is off.
   Updates CD-2.

## Still open

### CD-1 — Distribution & monetization
- **Question:** personal-use only, published free (ads/donations), or published paid?
- **Foundation default:** none; the M0 bundle is an internal build artifact.
- **To close:** captain states the model; `docs/licensing.md` consequences follow.

### CD-2 — Reciter shortlist (gate set, shortlist pending)
- **Question:** which reciters ship once Quran Foundation's written
  confirmations exist?
- **Current state:** gate and mechanism are implemented and enforced; no audio
  reciter enabled. Candidates documented in `config/reciters.json`;
  quran-align timing-only recitations are staged separately (no audio) so word
  highlighting works once matching audio is confirmed.
- **To close:** bring the written confirmations, enable the confirmed entries,
  keep the machine-checked license verification in place.

### CD-6 — Word-level transliteration / timing source
- **Resolved 2026-09-25:** Tanzil ayah-level transliteration split into word
  tokens + cpfair/quran-align CC BY 4.0 word timings (11 of 12 released
  recitations; As-Sudais file is corrupt and excluded).
- **Remaining nit:** an As-Sudais timing replacement would need a new upstream
  release or a different source; the pipeline will pick it up by config change.

## Recorded defaults still in force

- **Tanzil Uthmani v1.1** as the text backbone, stored verbatim with its
  notice, and the Tanzil metadata file for surah/juz/hizb/page/sajdah data.
- **Audio never bundled in this repository**: manifests record chapter URLs and
  hashes; the app downloads per surah (default) or per preset (option).
- **QuranicAudio is permanently deny-listed**; validation fails on any matching
  URL regardless of future catalog changes.
