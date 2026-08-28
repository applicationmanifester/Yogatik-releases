from fastapi import FastAPI
from .routers import chat
import logging
from pythonjsonlogger import jsonlogger
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from fastapi import Response

# JSON Logging setup
logger = logging.getLogger("companion")
logger.setLevel(logging.INFO)
logHandler = logging.StreamHandler()
formatter = jsonlogger.JsonFormatter("%(asctime)s %(levelname)s %(name)s %(message)s")
logHandler.setFormatter(formatter)
logger.addHandler(logHandler)

# Prometheus metrics
REQUEST_COUNT = Counter(
    "companion_requests_total", "Total API requests", ["method", "endpoint", "http_status"]
)
REQUEST_LATENCY = Histogram(
    "companion_request_latency_seconds", "Request latency", ["endpoint"]
)

app = FastAPI(title="AI Companion API")
app.include_router(chat.router, prefix="/api/v1")

@app.middleware("http")
async def metrics_middleware(request, call_next):
    with REQUEST_LATENCY.labels(endpoint=request.url.path).time():
        response = await call_next(request)
    REQUEST_COUNT.labels(
        method=request.method,
        endpoint=request.url.path,
        http_status=response.status_code,
    ).inc()
    return response

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/metrics")
def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)