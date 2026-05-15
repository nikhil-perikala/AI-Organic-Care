"""
Custom Python scheduler (no Airflow dependency for v1).
Runs full ingestion weekly (Sunday 2am UTC) and incremental daily (3am UTC).
"""
import asyncio
import schedule
import time
import structlog
from ingestion.pipeline import run_ingestion, ingest_curated_knowledge

logger = structlog.get_logger()


async def _run_full():
    logger.info("Scheduled full ingestion starting")
    result = await run_ingestion("full")
    logger.info("Full ingestion done", **result)


async def _run_incremental():
    logger.info("Scheduled incremental ingestion starting")
    result = await run_ingestion("incremental")
    logger.info("Incremental ingestion done", **result)


def run_in_loop(coro):
    asyncio.run(coro)


def start_scheduler():
    logger.info("Ingestion scheduler started")

    # Initial seed on startup if running for the first time
    asyncio.run(ingest_curated_knowledge())

    schedule.every().sunday.at("02:00").do(run_in_loop, _run_full())
    schedule.every().day.at("03:00").do(run_in_loop, _run_incremental())

    logger.info("Scheduler registered", jobs=[str(j) for j in schedule.get_jobs()])

    while True:
        schedule.run_pending()
        time.sleep(60)


if __name__ == "__main__":
    start_scheduler()
