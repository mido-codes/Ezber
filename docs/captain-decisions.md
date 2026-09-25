# Captain decisions

Product and legal calls that the engineering foundation must not make on its
own. The research report (`/home/dogukan/dev/firstmate/data/quran-app-tech/report.md`,
2026-09-25) opened three; building M0 surfaced three more. Every one is
recorded here rather than silently baked into code. When a decision closes,
update this file in the same commit as the resulting change.

## Resolved by the captain — 2026-09-25 (inbox 001)

The captain's decisions arrived as one message; the code and docs were updated
to match. These supersede the earlier "foundation defaults".

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
   (`segments.word_index >= 1`), and the pipeline has a swappable
   `sources/word_level.py` adapter (config: `config/word_level.json`,
   disabled). No word data is bundled until a bundleable, redistributable
   source passes the rights review. Updates CD-6.
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
- **Current state:** gate and mechanism are implemented and enforced; no reciter
  enabled. Candidates documented in `config/reciters.json`.
- **To close:** bring the written confirmations, enable the confirmed entries,
  keep the machine-checked license verification in place.

### CD-6 — Word-level transliteration / timing source
- **Question:** which redistributable source provides the word transliteration
  and per-word timings?
- **Current state:** adapter contract, schema and validation are in place
  (`sources/word_level.py`, `config/word_level.json`); no source enabled.
  Candidates listed off: QUL word transliteration, `cpfair/quran-align` timing.
- **To close:** name the rights-cleared source, add its adapter and license
  entry, set `enabled: true` and the `timing_target`.

## Recorded defaults still in force

- **Tanzil Uthmani v1.1** as the text backbone, stored verbatim with its
  notice, and the Tanzil metadata file for surah/juz/hizb/page/sajdah data.
- **Audio never bundled in this repository**: manifests record chapter URLs and
  hashes; the app downloads per surah (default) or per preset (option).
- **QuranicAudio is permanently deny-listed**; validation fails on any matching
  URL regardless of future catalog changes.
