# Licensing and attribution

Every bundled asset must appear in the content manifest with a source URL, a
version/hash, a `license_id` from `licenses/registry.json`, and an attribution
string. The pipeline fails the build when any of those is missing, when a
license id is unknown, or when a URL matches the distribution deny-list.

**The app is fully offline and ships only redistributable content.**
Captain decision 2026-09-25: no Quran Foundation content, no runtime Content
API/OAuth/token-broker path, and no English translation.

## What the M0 bundle currently ships

| Asset | Source | License | Key obligations |
|---|---|---|---|
| Quran text (Uthmani v1.1) + metadata | Tanzil Project | `cc-by-3.0` | Verbatim only; credit Tanzil and link tanzil.net; ship the notice (`TANZIL-NOTICE.txt`) |

That is the whole shipped bundle today. The tables and pipelines for the rest
are in place but deliberately empty until rights clear:

- **Recitation audio + ayah timing** — candidates exist (CC BY 4.0 Internet
  Archive items) but captain CD-2 requires Quran Foundation's written
  confirmation before any is enabled; all entries in
  `config/reciters.json` are `enabled: false`, and the audio manifest lists
  them under `pending_reciter_candidates` with no files.
- **Word-level transliteration + per-word timing** — required for highlighting,
  but no redistributable source has passed the rights review; the adapter seam
  in `content-pipeline/ezber_pipeline/sources/word_level.py` and
  `config/word_level.json` is disabled, so `words` and word-level `segments`
  are empty.
- **English translation** — dropped entirely per captain decision; the
  `translations` tables stay reserved and empty.

## Policy rules enforced by the pipeline

1. **Tanzil text is immutable.** Stored verbatim; the upstream copyright notice
   is compared with `licenses/notices/tanzil-quran-text-1.1-notice.txt` on
   every build and a changed notice fails the build.
2. **QuranicAudio is banned.** `quranicaudio.com` is in
   `config/sources.json` under `policy.deny_hosts`; `validate.py` and
   `verify` fail if any URL matches.
3. **Reciter admission requires written confirmation.** `config/reciters.json`
   entries must declare `enabled` explicitly, and only
   `status: pending_written_confirmation` → `enabled: true` after Quran
   Foundation confirms in writing. Once enabled, the pipeline still
   machine-checks the item's declared license on every build.
4. **Fallback sources stay off.** The Islamic Network / alquran.cloud CDN is
   documented under `fallback_sources` with `enabled: false`; config validation
   rejects an enabled fallback.
5. **No secrets.** There is no Quran Foundation client id/secret handling left
   in the pipeline at all.

## Residual risks to review before publishing

1. **Uploader-declared rights** (the unreleased audio candidates): even with
   the QF-confirmation gate, the recordings' publishers remain the ultimate
   rightsholders; keep the written confirmations on file with the manifest.
2. **Translation and QF serving terms are moot**: translation content was
   dropped, so no QF serving terms apply to this bundle.
3. **Transliteration sensitivities**: whatever source is eventually enabled
   must be labelled as transliteration, not scripture, and reviewed by a
   scholar/community before launch (report risk R5).
