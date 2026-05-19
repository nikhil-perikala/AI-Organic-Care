"""
Main ingestion pipeline orchestrator.
Full run (weekly): collect → clean → chunk → embed → store.
Incremental run (daily): collect new articles only → process → store.
"""
import asyncio
import uuid
from datetime import datetime
from typing import Literal
import structlog

from ingestion.collectors.web_crawler import crawl_seed_urls
from ingestion.collectors.usda_api import collect_usda_ingredients, ingredient_to_knowledge_text
from ingestion.collectors.pdf_collector import scan_pdf_directory
from ingestion.processors.cleaner import clean_documents
from ingestion.processors.chunker import chunk_all_documents
from ingestion.processors.embedder import embed_all_chunks, store_chunks

logger = structlog.get_logger()

PDF_DATA_DIR = "data/pdfs"
MODE = Literal["full", "incremental"]


async def run_ingestion(mode: MODE = "full"):
    run_id = str(uuid.uuid4())[:8]
    start = datetime.utcnow()
    logger.info("Ingestion started", run_id=run_id, mode=mode)

    # Step 1: Collect raw documents
    raw_docs = []

    web_docs = crawl_seed_urls(max_pages_per_seed=5 if mode == "full" else 2)
    raw_docs.extend(web_docs)
    logger.info("Web crawl complete", count=len(web_docs))

    usda_ingredients = collect_usda_ingredients()
    for ing in usda_ingredients:
        raw_docs.append({
            "url": f"usda://ingredient/{ing.get('name', '').replace(' ', '_')}",
            "title": ing.get("name", ""),
            "text": ingredient_to_knowledge_text(ing),
            "source_type": "usda",
            "category": "nutrition",
            "language": "en",
        })
    logger.info("USDA collection complete", count=len(usda_ingredients))

    pdf_docs = scan_pdf_directory(PDF_DATA_DIR)
    raw_docs.extend(pdf_docs)
    logger.info("PDF collection complete", count=len(pdf_docs))

    if not raw_docs:
        logger.warning("No documents collected — ingestion aborted")
        return {"run_id": run_id, "status": "no_data"}

    # Step 2: Clean
    clean_docs = clean_documents(raw_docs)

    # Step 3: Chunk
    chunks = chunk_all_documents(clean_docs)

    # Step 4: Embed
    embedded_chunks = await embed_all_chunks(chunks)

    # Step 5: Store
    from app.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        stored = await store_chunks(embedded_chunks, run_id, db)

    if mode == "full":
        curated_stored = await ingest_curated_knowledge()
        stored += curated_stored

    elapsed = (datetime.utcnow() - start).total_seconds()
    logger.info(
        "Ingestion complete",
        run_id=run_id,
        mode=mode,
        raw_docs=len(raw_docs),
        clean_docs=len(clean_docs),
        chunks=len(chunks),
        stored=stored,
        elapsed_s=elapsed,
    )
    return {"run_id": run_id, "status": "success", "stored": stored, "elapsed_s": elapsed}


# Also ingest the curated seed recipe and knowledge data
CURATED_KNOWLEDGE = [
    {
        "text": "Magnesium is essential for sleep. Foods rich in magnesium include spinach, pumpkin seeds, almonds, dark chocolate, and avocado. Magnesium regulates neurotransmitters and melatonin, promoting deep sleep. Studies show 300-400mg daily reduces insomnia symptoms.",
        "title": "Magnesium and Sleep",
        "url": "curated://magnesium-sleep",
        "source_type": "curated",
        "category": "nutrition",
        "ailment_tags": ["insomnia", "fatigue", "sleep"],
        "ingredient_tags": ["spinach", "pumpkin seeds", "almonds", "dark chocolate", "avocado"],
    },
    {
        "text": "Ashwagandha (Withania somnifera) is an adaptogenic herb that reduces cortisol levels by up to 30%. Clinical trials show significant reduction in stress and anxiety scores after 8 weeks of use. It also improves sleep quality and physical stamina.",
        "title": "Ashwagandha and Stress",
        "url": "curated://ashwagandha-stress",
        "source_type": "curated",
        "category": "adaptogens",
        "ailment_tags": ["stress", "anxiety", "fatigue", "insomnia"],
        "ingredient_tags": ["ashwagandha"],
    },
    {
        "text": "Turmeric contains curcumin, a potent anti-inflammatory compound. Curcumin inhibits NF-kB, a key inflammation regulator. Combined with black pepper (piperine), bioavailability increases 2000%. Effective for joint inflammation, gut health, and immune support.",
        "title": "Turmeric and Inflammation",
        "url": "curated://turmeric-inflammation",
        "source_type": "curated",
        "category": "anti-inflammatory",
        "ailment_tags": ["inflammation", "joint pain", "gut health", "immune support"],
        "ingredient_tags": ["turmeric", "curcumin", "black pepper"],
    },
    {
        "text": "Ginger contains gingerols and shogaols that reduce nausea, bloating, and gut inflammation. It accelerates gastric emptying and reduces intestinal cramping. 1-2g of ginger daily is clinically effective for nausea and digestive discomfort.",
        "title": "Ginger and Digestive Health",
        "url": "curated://ginger-digestion",
        "source_type": "curated",
        "category": "digestive",
        "ailment_tags": ["bloating", "nausea", "gut health", "digestive issues"],
        "ingredient_tags": ["ginger"],
    },
    {
        "text": "Vitamin C (ascorbic acid) is crucial for immune function. It stimulates production and function of white blood cells (lymphocytes and phagocytes). Found in bell peppers, kiwi, broccoli, strawberries, and citrus fruits. 200mg/day reduces cold duration by 8-14%.",
        "title": "Vitamin C and Immune Function",
        "url": "curated://vitamin-c-immune",
        "source_type": "curated",
        "category": "immune",
        "ailment_tags": ["immune support", "cold", "flu", "illness"],
        "ingredient_tags": ["bell pepper", "kiwi", "broccoli", "strawberry", "orange", "lemon"],
    },
    {
        "text": "Omega-3 fatty acids (EPA and DHA) reduce systemic inflammation by inhibiting pro-inflammatory eicosanoids. Best sources: fatty fish (salmon, mackerel, sardines), walnuts, chia seeds, flaxseed. 2-3g daily reduces CRP by 20-30% and improves brain fog, joint pain.",
        "title": "Omega-3 and Inflammation",
        "url": "curated://omega3-inflammation",
        "source_type": "curated",
        "category": "anti-inflammatory",
        "ailment_tags": ["inflammation", "brain fog", "joint pain", "cognitive function"],
        "ingredient_tags": ["salmon", "walnuts", "chia seeds", "flaxseed", "mackerel"],
    },
    {
        "text": "Probiotic-rich foods restore gut microbiome balance, reducing bloating and IBS symptoms. Key sources: Greek yogurt (Lactobacillus), kefir, kimchi, sauerkraut, miso, kombucha. Studies show 4-8 weeks of probiotics reduce bloating by 40% and improve gut motility.",
        "title": "Probiotics and Gut Health",
        "url": "curated://probiotics-gut",
        "source_type": "curated",
        "category": "digestive",
        "ailment_tags": ["bloating", "gut health", "IBS", "digestive issues"],
        "ingredient_tags": ["greek yogurt", "kefir", "kimchi", "sauerkraut", "miso", "kombucha"],
    },
    {
        "text": "L-tryptophan is a precursor to serotonin and melatonin — essential for mood and sleep. Highest sources: turkey, pumpkin seeds, tofu, milk, oats, bananas. Combining tryptophan with carbohydrates improves its transport across the blood-brain barrier.",
        "title": "Tryptophan and Sleep",
        "url": "curated://tryptophan-sleep",
        "source_type": "curated",
        "category": "nutrition",
        "ailment_tags": ["insomnia", "fatigue", "stress", "mood"],
        "ingredient_tags": ["turkey", "pumpkin seeds", "tofu", "milk", "oats", "banana"],
    },
    {
        "text": "Iron deficiency is the most common cause of fatigue. Heme iron from animal sources (red meat, poultry, fish) absorbs 2-3x better than non-heme iron from plants. Vitamin C increases non-heme absorption. Pair spinach with lemon juice, or lentils with bell pepper.",
        "title": "Iron, Fatigue, and Energy",
        "url": "curated://iron-fatigue",
        "source_type": "curated",
        "category": "nutrition",
        "ailment_tags": ["fatigue", "anemia", "low energy"],
        "ingredient_tags": ["spinach", "lentils", "red meat", "chicken", "pumpkin seeds", "quinoa"],
    },
    {
        "text": "Zinc supports immune cell production and reduces oxidative stress. Deficiency impairs both innate and adaptive immunity. Best food sources: oysters (highest), pumpkin seeds, beef, chickpeas, cashews. 8-11mg daily for adults maintains immune resilience.",
        "title": "Zinc and Immune Defense",
        "url": "curated://zinc-immune",
        "source_type": "curated",
        "category": "immune",
        "ailment_tags": ["immune support", "cold", "illness"],
        "ingredient_tags": ["pumpkin seeds", "beef", "chickpeas", "cashews"],
    },
]


async def ingest_curated_knowledge():
    """Ingest hand-curated knowledge into the vector store."""
    logger.info("Ingesting curated knowledge", count=len(CURATED_KNOWLEDGE))
    clean_docs = clean_documents(CURATED_KNOWLEDGE)
    chunks = chunk_all_documents(clean_docs)
    embedded = await embed_all_chunks(chunks)

    from app.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        stored = await store_chunks(embedded, "curated-seed", db)

    logger.info("Curated knowledge ingested", stored=stored)
    return stored


if __name__ == "__main__":
    asyncio.run(run_ingestion("full"))
