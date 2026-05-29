from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI

from analyzer import load_analyzer
from routes import router

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_analyzer()
    yield


app = FastAPI(title="StreakMeet Face Service", lifespan=lifespan)
app.include_router(router)
