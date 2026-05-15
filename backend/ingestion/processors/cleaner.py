"""
Data cleaning pipeline: dedup, noise removal, standardization, validation, language detection.
"""
import re
import hashlib
from typing import List, Dict, Optional
from langdetect import detect, LangDetectException
import structlog

logger = structlog.get_logger()

# Patterns that indicate non-content text (ads, boilerplate, scripts)
NOISE_PATTERNS = [
    r"cookie policy", r"privacy policy", r"terms of service",
    r"subscribe to our newsletter", r"click here to", r"advertisement",
    r"share on (facebook|twitter|instagram)", r"follow us on",
    r"\[if (IE|lt IE)\]", r"<script", r"<style",
    r"loading\.\.\.", r"please wait",
]
NOISE_RE = re.compile("|".join(NOISE_PATTERNS), re.IGNORECASE)

# Unit normalization map
UNIT_MAP = {
    "microgram": "mcg", "micrograms": "mcg", "μg": "mcg",
    "milligram": "mg", "milligrams": "mg",
    "gram": "g", "grams": "g",
    "kilogram": "kg", "kilograms": "kg",
    "international unit": "IU", "international units": "IU",
    "milliliter": "mL", "milliliters": "mL",
    "liter": "L", "liters": "L",
    "ounce": "oz", "ounces": "oz",
    "pound": "lb", "pounds": "lb",
    "teaspoon": "tsp", "teaspoons": "tsp",
    "tablespoon": "tbsp", "tablespoons": "tbsp",
    "cup": "cup", "cups": "cups",
}


def compute_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def remove_noise(text: str) -> str:
    lines = text.split("\n")
    clean_lines = [l for l in lines if not NOISE_RE.search(l)]
    text = "\n".join(clean_lines)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def normalize_units(text: str) -> str:
    for long_form, short_form in UNIT_MAP.items():
        text = re.sub(rf"\b{re.escape(long_form)}s?\b", short_form, text, flags=re.IGNORECASE)
    return text


def detect_language(text: str) -> str:
    try:
        return detect(text[:500]) if text else "en"
    except LangDetectException:
        return "en"


def validate_doc(doc: Dict) -> bool:
    text = doc.get("text", "")
    if len(text) < 100:
        return False
    if doc.get("language", "en") != "en":
        return False
    return True


def clean_documents(docs: List[Dict]) -> List[Dict]:
    """Full cleaning pipeline applied to a list of raw documents."""
    seen_hashes = set()
    cleaned = []

    for doc in docs:
        text = doc.get("text", "")
        if not text:
            continue

        text = remove_noise(text)
        text = normalize_units(text)
        doc["text"] = text
        doc["language"] = detect_language(text)

        if not validate_doc(doc):
            continue

        text_hash = compute_hash(text[:500])
        if text_hash in seen_hashes:
            logger.debug("Duplicate document skipped", url=doc.get("url"))
            continue
        seen_hashes.add(text_hash)
        doc["content_hash"] = text_hash
        cleaned.append(doc)

    logger.info("Cleaning complete", input=len(docs), output=len(cleaned))
    return cleaned
