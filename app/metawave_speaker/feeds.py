"""Fetch public RSS feeds without allowing requests into private networks."""

import http.client
import ipaddress
import re
import socket
import ssl
from html.parser import HTMLParser
from urllib.parse import urlsplit

import feedparser

from llm_client import NewsItem

MAX_BYTES = 2 * 1024 * 1024


class _Text(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def _plain(value: str) -> str:
    parser = _Text()
    parser.feed(value)
    return " ".join(" ".join(parser.parts).split())[:1200]


def _news_item(entry, feed_source: str) -> NewsItem:
    publisher = _plain(entry.get("source", {}).get("title", ""))
    title = _plain(entry.get("title", ""))
    raw_summary = entry.get("summary", "")
    summary = _plain(raw_summary)
    source_name = publisher or feed_source
    first_word = source_name.split(maxsplit=1)[0] if source_name else ""
    if first_word:
        title = re.sub(r"^" + re.escape(first_word) + r"\+\s*[|:]\s*", "", title, flags=re.IGNORECASE)
    if publisher:
        title = re.sub(r"\s+[-–—]\s+" + re.escape(publisher) + r"\s*$", "", title, flags=re.IGNORECASE)
        trailing_font = re.search(r"<font\b[^>]*>[^<]*</font>\s*$", raw_summary, re.IGNORECASE)
        if trailing_font and _plain(trailing_font.group()) == publisher:
            summary = re.sub(r"\s+" + re.escape(publisher) + r"\s*$", "", summary, flags=re.IGNORECASE)
    return NewsItem(title, summary, source_name)


def fetch_feed(url: str) -> list[NewsItem]:
    parsed = urlsplit(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Ungültige RSS-URL")
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    if port not in (80, 443):
        raise ValueError("RSS-URLs müssen Port 80 oder 443 verwenden")
    addresses = socket.getaddrinfo(parsed.hostname, port, type=socket.SOCK_STREAM)
    ips = {info[4][0] for info in addresses}
    if not ips or any(not ipaddress.ip_address(ip).is_global for ip in ips):
        raise ValueError("RSS-URL verweist nicht ausschliesslich auf öffentliche Adressen")

    # Pin the checked IP, while keeping the original hostname for TLS and Host.
    address = next(iter(ips))
    connection = http.client.HTTPConnection(parsed.hostname, port, timeout=15)
    sock = socket.create_connection((address, port), timeout=15)
    try:
        if parsed.scheme == "https":
            sock = ssl.create_default_context().wrap_socket(sock, server_hostname=parsed.hostname)
        connection.sock = sock
        target = parsed.path or "/"
        if parsed.query:
            target += "?" + parsed.query
        connection.request("GET", target, headers={"User-Agent": "MetaWave-Speaker/1.0", "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml"})
        response = connection.getresponse()
        if response.status != 200:
            raise RuntimeError(f"RSS-Server antwortete mit HTTP {response.status}")
        data = response.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError("RSS-Feed ist zu gross")
    finally:
        connection.close()

    parsed_feed = feedparser.parse(data)
    if parsed_feed.bozo:
        raise ValueError(f"RSS-Feed ist ungültig: {parsed_feed.bozo_exception}")
    source = _plain(parsed_feed.feed.get("title", parsed.hostname))
    items = [
        _news_item(entry, source)
        for entry in parsed_feed.entries[:3]
        if entry.get("title")
    ]
    if not items:
        raise ValueError(f"RSS-Feed {parsed.hostname} enthält keine Nachrichten")
    return items
