# Captain decisions

Product and legal calls that the engineering foundation must not make on its
own. The research report (`/home/dogukan/dev/firstmate/data/quran-app-tech/report.md`,
2026-09-25, §8) opened three; building M0 surfaced three more. Every one is
recorded here rather than silently baked into code. When a decision closes,
update this file in the same commit as the resulting change.

## Open

### CD-1 — Distribution & monetization
- **Question:** personal-use only, published free (ads/donations), or published paid?
- **Why it matters:** it decides whether personal-use-only audio sources are
  acceptable and which licenses are required.
- **Foundation default:** none; the M0 bundle is an internal build artifact.
- **To close:** captain states the model; `docs/licensing.md` consequences follow.

### CD-2 — Reciter strategy and final shortlist
- **Question:** which reciters ship, and does the app seek direct permission or
  rely on the source's declared license?
- **Foundation default:** five CC BY 4.0 Internet Archive candidates (Al-Afasy,
  Alsudais, Al-Husary mujawwad, al-Shatri, al-Minshawi), all machine-checked at
  build time; no other sources.
- **Open sub-issue:** the CC BY 4.0 declaration comes from the uploading
  distributor (Dhikr Al-Huda App), not from each reciter's publisher. Decide
  whether a rights review or direct permission is required for store
  distribution.
- **Already enforced in code:** QuranicAudio-backed recordings are refused;
  incomplete timing data refuses the build (this is why Al-Husary murattal is
  excluded — its published chapter-1 timing is broken).

### CD-3 — Translation and transliteration editions
- **Question:** final English translation edition, transliteration scheme, and
  whether Arabic script is displayed at all.
- **Foundation default (brief-authorized):** QF resource 57 transliteration
  (ayah-level) + public-domain Pickthall served as QF resource 19; Arabic shown
  but optional per preset.
- **To close:** captain confirms the edition(s) and whether word-level
  transliteration is required (see CD-6).

### CD-4 — Quran Foundation runtime access strategy
- **Question:** serve QF content from the bundled snapshot, or fetch at runtime
  through a small server-side token broker / Content Sync?
- **Why it matters:** QF's Developer Terms allow in-app display but not raw
  redistribution, prohibit >1-week caching outside Content Sync, and mandate
  server-only token exchange.
- **Foundation default:** bundled snapshot built with the public legacy
  endpoint; authenticated OAuth2 mode is implemented but requires environment
  credentials (`QF_CLIENT_ID`/`QF_CLIENT_SECRET`).
- **To close:** captain chooses the runtime architecture before any release;
  determines whether a broker is built (report §5).

### CD-5 — Audio hosting and offline model
- **Question:** stream/download directly from archive.org, or mirror the
  licensed audio on Ezber-controlled storage; per-surah vs per-preset downloads?
- **Foundation default:** manifest records archive.org URLs and hashes; the app
  downloads per chapter at runtime; no audio is bundled in the repo.
- **To close:** host decision plus storage/size policy for offline use.

### CD-6 — Word-level transliteration / alignment source
- **Question:** populate `words` and word-level `segments` from QF's
  word-by-word transliteration (resource 60, authenticated Content Sync) or a
  QUL dataset?
- **Why it matters:** the `words` table is intentionally empty in M0; word
  highlighting depends on this choice and on a license that permits it.
- **Foundation default:** ayah-level transliteration only; `segments`
  `word_index = 0`.
- **To close:** captain picks the source; pipeline gains a words adapter.

## Recorded defaults taken under the brief's authority

These were decided during M0 because the launch brief explicitly allowed the
choice; they are not open questions, but they remain overridable by the captain.

- QF **translation resource 19 (Pickthall)** over other editions: public-domain
  underlying work, same provenance path as resource 57, rationale recorded in
  `config/translations.json`.
- **Internet Archive CC BY 4.0** as the only audio source class for the initial
  catalog, with machine-checked license evidence.
- **Public legacy QF endpoint** as the zero-credential default for reproducible
  builds; authenticated mode available via environment variables.
- **Tanzil Uthmani v1.1** as the text backbone, stored verbatim with its notice.
