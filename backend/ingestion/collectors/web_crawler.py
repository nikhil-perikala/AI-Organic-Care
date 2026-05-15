"""
Web crawler for organic health and nutrition content.
Fetches articles, blog posts, and recipe pages.
"""
import asyncio
import re
from typing import List, Dict, Optional
from urllib.parse import urljoin, urlparse
import requests
from bs4 import BeautifulSoup
from langdetect import detect, LangDetectException
import structlog

logger = structlog.get_logger()

# Curated seed URLs for organic health knowledge
SEED_URLS = [
    {"url": "https://www.healthline.com/nutrition", "category": "nutrition", "type": "article"},
    {"url": "https://www.medicalnewstoday.com/categories/nutrition", "category": "nutrition", "type": "article"},
    {"url": "https://www.organicauthority.com/", "category": "organic", "type": "article"},
    {"url": "https://www.draxe.com/nutrition/", "category": "nutrition", "type": "article"},
]


def fetch_page(url: str, timeout: int = 15) -> Optional[BeautifulSoup]:
    try:
        headers = {"User-Agent": "OrganicCareBot/1.0 (+https://organiccare.ai/bot)"}
        resp = requests.get(url, headers=headers, timeout=timeout)
        resp.raise_for_status()
        return BeautifulSoup(resp.text, "lxml")
    except Exception as e:
        logger.warning("Failed to fetch page", url=url, error=str(e))
        return None


def extract_article_text(soup: BeautifulSoup, url: str) -> Dict:
    """Extract clean text and metadata from an article page."""
    for tag in soup.find_all(["script", "style", "nav", "footer", "header", "aside", "form"]):
        tag.decompose()

    title = ""
    if soup.find("h1"):
        title = soup.find("h1").get_text(strip=True)
    elif soup.find("title"):
        title = soup.find("title").get_text(strip=True)

    content_tags = soup.find_all(["article", "main", ".post-content", ".article-body"])
    if content_tags:
        text = " ".join(t.get_text(separator=" ", strip=True) for t in content_tags)
    else:
        text = soup.get_text(separator=" ", strip=True)

    text = re.sub(r"\s+", " ", text).strip()

    lang = "en"
    try:
        if len(text) > 50:
            lang = detect(text[:500])
    except LangDetectException:
        pass

    return {"url": url, "title": title, "text": text, "language": lang}


def crawl_seed_urls(max_pages_per_seed: int = 5) -> List[Dict]:
    """Crawl seed URLs and collect raw text documents."""
    collected = []
    for seed in SEED_URLS:
        soup = fetch_page(seed["url"])
        if not soup:
            continue

        doc = extract_article_text(soup, seed["url"])
        doc["category"] = seed["category"]
        doc["source_type"] = seed["type"]
        if doc["text"] and len(doc["text"]) > 200:
            collected.append(doc)
            logger.info("Collected article", url=seed["url"], chars=len(doc["text"]))

    return collected


def crawl_custom_url(url: str, category: str = "general") -> Optional[Dict]:
    """Crawl a single custom URL and return extracted document."""
    soup = fetch_page(url)
    if not soup:
        return None
    doc = extract_article_text(soup, url)
    doc["category"] = category
    doc["source_type"] = "custom"
    return doc if doc["text"] and len(doc["text"]) > 100 else None
