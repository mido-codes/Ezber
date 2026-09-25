"""Quran Foundation Content API source.

Two access modes:

* ``authenticated-*`` when ``QF_CLIENT_ID``/``QF_CLIENT_SECRET`` are present in
  the environment. The client secret is read from the environment only, used
  for one OAuth2 client-credentials exchange, and never cached to disk, written
  to a manifest or logged. This mirrors QF's Server-Only Rule.
* ``public-legacy`` (the default in this repo, which has no secrets) uses the
  unauthenticated legacy endpoint at api.quran.com so a foundation build is
  reproducible with zero credentials. The chosen resource ids (transliteration
  57, translation 19) resolve to the same editions through both paths; the
  manifest records which one served the build.
"""

from __future__ import annotations

import base64
import json
import time
import urllib.parse
from dataclasses import dataclass, field

from ..canonical import digest_json
from ..errors import ConfigError, FetchError, ValidationError
from ..fetch import Fetcher

TOKEN_SAFETY_MARGIN_SECONDS = 60


@dataclass(frozen=True)
class QFAccess:
    mode: str
    base_url: str
    auth_base_url: str | None
    client_id_present: bool
    client_secret_present: bool

    def describe(self) -> dict[str, object]:
        """Serializable description that can never contain a secret."""
        return {
            "mode": self.mode,
            "base_url": self.base_url,
            "auth_base_url": self.auth_base_url,
            "client_id_present": self.client_id_present,
            "client_secret_present": self.client_secret_present,
        }


@dataclass
class EditionCorpus:
    resource_id: str
    rows: dict[str, str] = field(default_factory=dict)  # verse_key -> text
    chapters_fetched: int = 0

    @property
    def digest(self) -> str:
        ordered = sorted(self.rows.items(), key=lambda item: _verse_key_order(item[0]))
        return digest_json([list(item) for item in ordered])


def _verse_key_order(verse_key: str) -> tuple[int, int]:
    surah, ayah = verse_key.split(":", 1)
    return int(surah), int(ayah)


class QFClient:
    def __init__(self, fetcher: Fetcher, qf_config: dict, *, require_auth: bool = False) -> None:
        self.fetcher = fetcher
        self.config = qf_config
        client_id = qf_config.get("_client_id")
        client_secret = qf_config.get("_client_secret")
        have_credentials = bool(client_id and client_secret)

        if require_auth and not have_credentials:
            raise ConfigError(
                "authenticated Quran Foundation access was requested but QF_CLIENT_ID/QF_CLIENT_SECRET "
                "are not set in the environment; nothing is read from the repo"
            )

        if have_credentials:
            environment = qf_config.get("_environment") or qf_config["default_environment"]
            if environment not in ("prelive", "production"):
                raise ConfigError(f"QF_ENV must be 'prelive' or 'production', got {environment!r}")
            environment_config = qf_config[environment]
            self.access = QFAccess(
                mode=f"authenticated-{environment}",
                base_url=environment_config["api_base_url"],
                auth_base_url=environment_config["auth_base_url"],
                client_id_present=True,
                client_secret_present=True,
            )
            self._client_id = client_id
            self._client_secret = client_secret
        else:
            self.access = QFAccess(
                mode="public-legacy",
                base_url=qf_config["public_base_url"],
                auth_base_url=None,
                client_id_present=False,
                client_secret_present=False,
            )
            self._client_id = None
            self._client_secret = None

        self._token: str | None = None
        self._token_expires_at = 0.0
        self.page_size = int(qf_config.get("page_size", 300))
        self.scope = qf_config.get("token_scope", "content")

    # -- auth --------------------------------------------------------------

    def _access_token(self) -> str:
        if self.access.auth_base_url is None:
            raise ConfigError("token requested for a non-authenticated access mode")
        if self._token and time.monotonic() < self._token_expires_at:
            return self._token

        basic = base64.b64encode(
            f"{self._client_id}:{self._client_secret}".encode("ascii")
        ).decode("ascii")
        result = self.fetcher.post_form(
            f"{self.access.auth_base_url}/oauth2/token",
            {"grant_type": "client_credentials", "scope": self.scope},
            headers={"Authorization": f"Basic {basic}"},
        )
        try:
            payload = json.loads(result.data.decode("utf-8"))
            token = payload["access_token"]
            expires_in = float(payload.get("expires_in", 3600))
        except (KeyError, ValueError, UnicodeDecodeError) as error:
            raise FetchError(f"unexpected Quran Foundation token response: {error}") from error
        self._token = token
        self._token_expires_at = time.monotonic() + max(0.0, expires_in - TOKEN_SAFETY_MARGIN_SECONDS)
        return token

    def _headers(self) -> dict[str, str]:
        if self.access.auth_base_url is None:
            return {}
        return {"x-auth-token": self._access_token(), "x-client-id": self._client_id or ""}

    # -- content -----------------------------------------------------------

    def fetch_editions(self, resource_ids: list[str], chapter_verse_counts: dict[int, int]) -> dict[str, EditionCorpus]:
        """Fetch every ayah of the given editions, keyed by resource id."""
        corpora = {resource_id: EditionCorpus(resource_id) for resource_id in resource_ids}
        editions_param = ",".join(resource_ids)

        for chapter in sorted(chapter_verse_counts):
            page = 1
            seen_verse_keys: set[str] = set()
            while True:
                query = urllib.parse.urlencode(
                    {"translations": editions_param, "per_page": self.page_size, "page": page}
                )
                url = f"{self.access.base_url}/verses/by_chapter/{chapter}?{query}"
                result = self.fetcher.get(url, headers=self._headers())
                try:
                    payload = json.loads(result.data.decode("utf-8"))
                    verses = payload["verses"]
                    pagination = payload.get("pagination", {})
                except (KeyError, ValueError, UnicodeDecodeError) as error:
                    raise FetchError(f"unexpected Quran Foundation response for chapter {chapter}: {error}") from error

                for verse in verses:
                    verse_key = verse["verse_key"]
                    seen_verse_keys.add(verse_key)
                    translations = {str(row["resource_id"]): row["text"] for row in verse.get("translations", [])}
                    for resource_id, text in translations.items():
                        if resource_id in corpora:
                            if not isinstance(text, str) or not text.strip():
                                raise ValidationError(
                                    [f"Quran Foundation resource {resource_id} returned empty text for {verse_key}"]
                                )
                            corpora[resource_id].rows[verse_key] = text

                total_pages = int(pagination.get("total_pages", 1))
                if page >= total_pages:
                    break
                page += 1

            expected = chapter_verse_counts[chapter]
            if len(seen_verse_keys) != expected:
                raise ValidationError(
                    [
                        f"Quran Foundation chapter {chapter}: expected {expected} verses, "
                        f"received {len(seen_verse_keys)}"
                    ]
                )
            for corpus in corpora.values():
                corpus.chapters_fetched += 1

        return corpora

    def source_url_template(self, resource_ids: list[str]) -> str:
        return (
            f"{self.access.base_url}/verses/by_chapter/{{chapter}}"
            f"?translations={','.join(resource_ids)}&per_page={self.page_size}&page={{page}}"
        )
