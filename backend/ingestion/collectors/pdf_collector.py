"""
PDF and document collector using PyPDF2 and Unstructured.
Supports nutrition books, research papers, and reports.
"""
import os
from pathlib import Path
from typing import List, Dict, Optional
import structlog

logger = structlog.get_logger()


def extract_pdf_text(pdf_path: str) -> Optional[Dict]:
    """Extract text from a PDF file using PyPDF2 with fallback to Unstructured."""
    path = Path(pdf_path)
    if not path.exists():
        logger.warning("PDF not found", path=pdf_path)
        return None

    text = _extract_with_pypdf2(path) or _extract_with_unstructured(path)
    if not text or len(text) < 100:
        return None

    return {
        "url": f"file://{path.absolute()}",
        "title": path.stem.replace("_", " ").title(),
        "text": text,
        "source_type": "pdf",
        "category": "research",
        "language": "en",
    }


def _extract_with_pypdf2(path: Path) -> Optional[str]:
    try:
        import PyPDF2
        with open(path, "rb") as f:
            reader = PyPDF2.PdfReader(f)
            pages = [reader.pages[i].extract_text() or "" for i in range(len(reader.pages))]
        text = "\n".join(pages).strip()
        return text if text else None
    except Exception as e:
        logger.debug("PyPDF2 extraction failed", path=str(path), error=str(e))
        return None


def _extract_with_unstructured(path: Path) -> Optional[str]:
    try:
        from unstructured.partition.pdf import partition_pdf
        elements = partition_pdf(filename=str(path))
        return "\n\n".join(str(e) for e in elements)
    except Exception as e:
        logger.debug("Unstructured extraction failed", path=str(path), error=str(e))
        return None


def scan_pdf_directory(directory: str) -> List[Dict]:
    """Scan a directory for PDFs and extract text from each."""
    docs = []
    base = Path(directory)
    if not base.exists():
        return docs

    for pdf_path in base.glob("**/*.pdf"):
        doc = extract_pdf_text(str(pdf_path))
        if doc:
            docs.append(doc)
            logger.info("Extracted PDF", path=str(pdf_path), chars=len(doc["text"]))

    return docs
