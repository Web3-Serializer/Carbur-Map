from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import signal
import sys

from fetcher import DataFetcher
from predictor import Predictor

fetcher = DataFetcher()
predictor = Predictor()


def handle_exit(sig, frame):
    sys.exit(0)


signal.signal(signal.SIGINT, handle_exit)
signal.signal(signal.SIGTERM, handle_exit)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await fetcher.refresh()
    yield

app = FastAPI(title="Carbur'Map API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/api/stations")
async def get_stations(
    fuel: str = Query("SP95"),
    dept: str = Query(None),
    pop: int = Query(0, ge=0, le=1000000),
):
    return {"stations": fetcher.get_stations(fuel=fuel, dept=dept, pop=pop)}


@app.get("/api/stats")
async def get_stats(fuel: str = Query("SP95"), dept: str = Query(None)):
    return fetcher.get_stats(fuel=fuel, dept=dept)


@app.get("/api/history")
async def get_history(
    fuel: str = Query("SP95"),
    days: int = Query(30, le=90),
    dept: str = Query(None),
):
    return fetcher.get_history(fuel=fuel, days=days, dept=dept)


@app.get("/api/predict")
async def get_prediction(
    fuel: str = Query("SP95"),
    horizon: int = Query(7, le=60),
    dept: str = Query(None),
    depth: int = Query(180, ge=30, le=365),
    confidence: int = Query(95),
):
    history = fetcher.get_history(fuel=fuel, days=90, dept=dept)
    result = predictor.forecast(
        fuel=fuel,
        dept=dept or "",
        horizon=horizon,
        depth=depth,
        confidence=confidence,
        fallback_history=history,
    )
    if not result["history"]:
        raise HTTPException(status_code=422, detail="Pas assez de données pour prédire")
    return result


@app.get("/api/fuels")
async def get_fuels():
    return {"fuels": ["SP95", "SP98", "Gazole", "E10", "E85", "GPLc"]}


@app.get("/api/departments")
async def get_departments():
    return {"departments": fetcher.get_departments()}


@app.post("/api/refresh")
async def refresh():
    await fetcher.refresh()
    return {"status": "ok"}
