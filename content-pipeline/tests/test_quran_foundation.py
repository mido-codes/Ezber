from __future__ import annotations

import base64
import unittest

from ezber_pipeline.errors import ConfigError
from ezber_pipeline.fetch import FetchResult
from ezber_pipeline.sources import quran_foundation
from tests import helpers


class AuthFakeFetcher:
    def __init__(self, routes: dict[str, bytes], token: str = "test-token") -> None:
        self.routes = routes
        self.token = token
        self.token_calls = 0
        self.basic_header: str | None = None
        self.last_get_headers: dict[str, str] | None = None

    def get(
        self, url: str, *, use_cache: bool = True, headers: dict[str, str] | None = None
    ) -> FetchResult:
        self.last_get_headers = headers
        data = self.routes[url]
        return FetchResult(url, data, "application/json", "", True)

    def post_form(self, url: str, form: dict[str, str], *, headers: dict[str, str] | None = None) -> FetchResult:
        self.token_calls += 1
        self.basic_header = (headers or {}).get("Authorization")
        data = f'{{"access_token": "{self.token}", "expires_in": 3600}}'.encode()
        return FetchResult(url, data, "application/json", "", False)


class QFClientTests(unittest.TestCase):
    def setUp(self) -> None:
        self.saved = helpers.clean_qf_environment()
        self.addCleanup(helpers.restore_qf_environment, self.saved)

    def _config(self, **overrides) -> dict:
        config = {
            "public_base_url": "https://api.quran.com/api/v4",
            "production": {
                "auth_base_url": "https://oauth2.quran.foundation",
                "api_base_url": "https://apis.quran.foundation/content/api/v4",
            },
            "prelive": {
                "auth_base_url": "https://prelive-oauth2.quran.foundation",
                "api_base_url": "https://apis-prelive.quran.foundation/content/api/v4",
            },
            "default_environment": "prelive",
            "token_scope": "content",
            "page_size": 50,
        }
        config.update(overrides)
        return config

    def test_public_mode_fetches_paginated_corpus(self) -> None:
        routes = helpers.synthetic_qf_route_keys(
            "https://api.quran.com/api/v4", ["19", "57"], page_size=50
        )
        fetcher = AuthFakeFetcher(routes)
        client = quran_foundation.QFClient(fetcher, self._config())
        self.assertEqual(client.access.mode, "public-legacy")
        counts = helpers.verse_counts()
        first = client.fetch_editions(["19", "57"], counts)
        self.assertEqual(len(first["19"].rows), 6236)
        self.assertEqual(len(first["57"].rows), 6236)
        self.assertEqual(first["19"].rows["2:255"], helpers.synthetic_translation(2, 255))
        second = client.fetch_editions(["19", "57"], counts)
        self.assertEqual(first["19"].digest, second["19"].digest)
        self.assertEqual(fetcher.token_calls, 0)

    def test_authenticated_mode_uses_token_without_exposing_secret(self) -> None:
        routes = helpers.synthetic_qf_route_keys(
            "https://apis-prelive.quran.foundation/content/api/v4", ["19"], page_size=50
        )
        fetcher = AuthFakeFetcher(routes)
        config = self._config(_client_id="client-123", _client_secret="super-secret")
        client = quran_foundation.QFClient(fetcher, config)
        self.assertEqual(client.access.mode, "authenticated-prelive")
        description = str(client.access.describe())
        self.assertNotIn("super-secret", description)
        client.fetch_editions(["19"], helpers.verse_counts())
        self.assertEqual(fetcher.token_calls, 1)
        expected = base64.b64encode(b"client-123:super-secret").decode()
        self.assertEqual(fetcher.basic_header, f"Basic {expected}")
        self.assertEqual(fetcher.last_get_headers.get("x-auth-token"), "test-token")
        self.assertEqual(fetcher.last_get_headers.get("x-client-id"), "client-123")

    def test_require_auth_without_credentials_fails(self) -> None:
        with self.assertRaises(ConfigError):
            quran_foundation.QFClient(AuthFakeFetcher({}), self._config(), require_auth=True)

    def test_empty_text_is_rejected(self) -> None:
        routes = helpers.synthetic_qf_route_keys(
            "https://api.quran.com/api/v4", ["19"], page_size=50
        )
        first_url = next(iter(routes))
        import json

        payload = json.loads(routes[first_url])
        for verse in payload["verses"]:
            for translation in verse["translations"]:
                if translation["resource_id"] == 19:
                    translation["text"] = "  "
        routes[first_url] = json.dumps(payload).encode()
        client = quran_foundation.QFClient(AuthFakeFetcher(routes), self._config())
        from ezber_pipeline.errors import ValidationError

        with self.assertRaises(ValidationError):
            client.fetch_editions(["19"], helpers.verse_counts())


if __name__ == "__main__":
    unittest.main()
