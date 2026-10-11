"""Run durable jobs alongside the API for a single-service demonstration."""

import asyncio

from starlette.concurrency import run_in_threadpool

from govfix.worker import Worker


async def worker_loop(sessions, settings, stop: asyncio.Event):
    worker = Worker(sessions, settings)
    while not stop.is_set():
        await run_in_threadpool(worker.run_once, settings.worker_batch_size)
        try:
            await asyncio.wait_for(stop.wait(), timeout=settings.worker_poll_seconds)
        except TimeoutError:
            pass
