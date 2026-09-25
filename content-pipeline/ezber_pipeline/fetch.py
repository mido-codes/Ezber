"""HTTP fetching with a deterministic on-disk cache.

* Normal builds revalidate with ETag/Last-Modified and fall back to the cache
  on 304, so a rebuild over unchanged upstream data is cheap and deterministic.
* ``--offline`` never touches the network and fails with a clear error when a
  source is not cached.
* OAuth tokens are never written to the cache.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from .canonical import sha256_hex
from .errors import FetchError, OfflineCacheMiss


@dataclass(frozen=True)
class FetchResult:
    url: str
    data: bytes
    content_type: str
    sha256: str
    from_cache: bool

    @property
    def bytes(self) -> int:
        return len(self.data)


class Fetcher:
    def __init__(
        self,
        cache_dir: Path | str,
        *,
        offline: bool = False,
        timeout_seconds: int = 60,
        retries: int = 3,
        retry_backoff_seconds: float = 2.0,
        user_agent: str = "ezber-content-pipeline",
    ) -> None:
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.offline = offline
        self.timeout_seconds = timeout_seconds
        self.retries = max(1, retries)
        self.retry_backoff_seconds = retry_backoff_seconds
        self.user_agent = user_agent

    # -- cache helpers -----------------------------------------------------

    def _cache_paths(self, url: str) -> tuple[Path, Path]:
        key = sha256_hex(url.encode("utf-8"))
        return self.cache_dir / f"{key}.bin", self.cache_dir / f"{key}.meta.json"

    def _read_cache(self, url: str) -> tuple[bytes, dict] | None:
        data_path, meta_path = self._cache_paths(url)
        if not data_path.exists() or not meta_path.exists():
            return None
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        return data_path.read_bytes(), meta

    def _write_cache(self, url: str, result: FetchResult, headers: dict[str, str]) -> None:
        data_path, meta_path = self._cache_paths(url)
        data_path.write_bytes(result.data)
        meta = {
            "url": url,
            "sha256": result.sha256,
            "bytes": result.bytes,
            "content_type": result.content_type,
            "etag": headers.get("etag"),
            "last_modified": headers.get("last-modified"),
        }
        meta_path.write_text(json.dumps(meta, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    # -- requests ----------------------------------------------------------

    def _request(
        self,
        url: str,
        *,
        method: str = "GET",
        headers: dict[str, str] | None = None,
        body: bytes | None = None,
    ) -> tuple[int, dict[str, str], bytes]:
        request_headers = {"User-Agent": self.user_agent, "Accept": "*/*"}
        if headers:
            request_headers.update(headers)
        request = urllib.request.Request(url, data=body, headers=request_headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                return response.status, dict(response.headers), response.read()
        except urllib.error.HTTPError as error:
            return error.code, dict(error.headers or {}), error.read()
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            raise FetchError(f"cannot reach {url}: {error}") from error

    def _request_with_retries(
        self,
        url: str,
        *,
        method: str = "GET",
        headers: dict[str, str] | None = None,
        body: bytes | None = None,
    ) -> tuple[int, dict[str, str], bytes]:
        last: tuple[int, dict[str, str], bytes] | None = None
        for attempt in range(self.retries):
            status, response_headers, data = self._request(url, method=method, headers=headers, body=body)
            if status < 400 or status in (400, 401, 403, 404):
                return status, response_headers, data
            last = (status, response_headers, data)
            if attempt + 1 < self.retries:
                time.sleep(self.retry_backoff_seconds * (2**attempt))
        assert last is not None
        return last

    def get(self, url: str, *, use_cache: bool = True, headers: dict[str, str] | None = None) -> FetchResult:
        cached = self._read_cache(url) if use_cache else None
        if self.offline:
            if cached is None:
                raise OfflineCacheMiss(
                    f"offline mode: {url} is not in the HTTP cache ({self.cache_dir}); "
                    "run a networked build first or drop --offline"
                )
            data, meta = cached
            return FetchResult(url, data, meta.get("content_type", ""), sha256_hex(data), True)

        conditional: dict[str, str] = dict(headers or {})
        if cached is not None:
            _, meta = cached
            if meta.get("etag"):
                conditional["If-None-Match"] = meta["etag"]
            if meta.get("last_modified"):
                conditional["If-Modified-Since"] = meta["last_modified"]

        status, response_headers, data = self._request_with_retries(url, headers=conditional)
        if status == 304 and cached is not None:
            cached_data, meta = cached
            return FetchResult(url, cached_data, meta.get("content_type", ""), sha256_hex(cached_data), True)
        if status != 200:
            raise FetchError(f"GET {url} returned HTTP {status}: {data[:200]!r}")
        content_type = response_headers.get("Content-Type", "")
        result = FetchResult(url, data, content_type, sha256_hex(data), False)
        if use_cache:
            self._write_cache(url, result, response_headers)
        return result

    def post_form(
        self,
        url: str,
        form: dict[str, str],
        *,
        headers: dict[str, str] | None = None,
    ) -> FetchResult:
        """POST a form body. Never cached: token responses must stay in memory."""
        body = urllib.parse.urlencode(form).encode("ascii")
        request_headers = {"Content-Type": "application/x-www-form-urlencoded"}
        if headers:
            request_headers.update(headers)
        status, response_headers, data = self._request_with_retries(
            url, method="POST", headers=request_headers, body=body
        )
        if status != 200:
            raise FetchError(f"POST {url} returned HTTP {status}")
        return FetchResult(url, data, response_headers.get("Content-Type", ""), sha256_hex(data), False)
