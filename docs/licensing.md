# Licensing and attribution

Every bundled asset must appear in the content manifest with a source URL, a
version/hash, a `license_id` from `licenses/registry.json`, and an attribution
string. The pipeline fails the build when any of those is missing, when a
license id is unknown, or when a URL matches the distribution deny-list.

## What the M0 bundle ships

| Asset | Source | License | Key obligations |
|---|---|---|---|
| Quran text (Uthmani v1.1) + metadata | Tanzil Project | `cc-by-3.0` | Verbatim only; credit Tanzil and link tanzil.net; ship the notice (`TANZIL-NOTICE.txt`) |
| Transliteration (ayah-level) | Quran Foundation resource 57 | `qf-developer-terms` | Credit "Quran data provided by Quran Foundation"; no raw-data redistribution; ≤7-day cache outside Content Sync; server-only token exchange |
| English translation | M. Pickthall (1930), served as QF resource 19 | `qf-served-public-domain` | Underlying work is public domain; the QF-served copy still carries QF's display/no-redistribution terms |
| Recitation audio + ayah timing | Dhikr Al-Huda App items on the Internet Archive | `cc-by-4.0` | Credit reciter + distributor + item, link the license, indicate no modifications |

The generated `content-pipeline/build/EZBER-LICENSES.json` is the credits-ready
view: license summaries, obligations and the exact attribution lines, suitable
for an in-app licenses screen.

## Choices and why

- **Translation: Pickthall via QF resource 19.** The brief allowed "a
  redistributable or Quran Foundation-served English translation". Pickthall
  (published 1930, author died 1936) is public domain in the US and life+70
  jurisdictions, so the underlying work is redistributable; fetching it from QF
  keeps a single provenance path with the mandated resource-57 transliteration.
  Captain decision CD-3 still owns the final edition choice.
- **Transliteration: QF resource 57**, as mandated by the launch brief.
  Word-level transliteration for highlighting is left to CD-6.
- **Audio: Internet Archive CC BY 4.0 items.** The report's sharpest constraint
  is reciter rights. The catalog admits a recording only when the item itself
  declares a distribution license that the pipeline can machine-check
  (`expected_license_url_prefix`), and the catalog excludes QuranicAudio-backed
  recordings entirely. The five candidate reciters are CC BY 4.0 items whose
  uploader prepared chapter audio plus ayah timing specifically for an app.
- **QuranicAudio is banned.** `quranicaudio.com` permits personal use only and
  forbids commercial use. It appears in `config/sources.json` under
  `policy.deny_hosts`; `validate.py` and `verify` fail if any URL matches.

## Residual risks to review before publishing

1. **Uploader-declared rights.** CC BY 4.0 is declared by the Internet Archive
   uploader (Dhikr Al-Huda App), not by each reciter's publisher. The license
   is explicit distribution permission from the distributor and is recorded as
   evidence in the manifest, but a rights review (or per-reciter permission) is
   still sensible before store distribution. Captain decision CD-2.
2. **Quran Foundation terms are not a redistribution license.** The QF content
   is bundled for display in the app, with attribution and no raw-data export.
   The 7-day cache rule and the runtime strategy are unresolved (CD-4); until
   then this bundle is an internal build artifact, not a published dataset.
3. **Pickthall public-domain status.** Public domain in the US (published 1930)
   and in life+70 jurisdictions; a jurisdiction-by-jurisdiction legal check is
   cheap insurance before monetized distribution.
4. **Transliteration sensitivities.** Transliteration is not scripture and must
   be labelled as such; a scholar/community review remains on the plan (report
   risk R5).
