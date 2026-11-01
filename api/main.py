"""Thin local solver API. Start with uvicorn api.main:app --port 8000."""

import asyncio
import importlib
from importlib.metadata import PackageNotFoundError, version
import json
import logging
import os
import threading
import time
from typing import Annotated
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from api.explain import router as explain_router
from api.plain_english import ExplainRequest, ExplainResponse, plain_english
from solver.audit import audit
from solver.baseline import baseline
from solver.contract import AuditReport, ContractModel, Scenario, Solution
from solver.inputs import Inputs, load_inputs


def load_resolver():
    try:
        model = importlib.import_module("solver.model")
    except ImportError:
        from api.stub_resolve import resolve as stub_resolve
        return stub_resolve, False, "fixture-v1"
    try:
        solver_version = "highspy-" + version("highspy")
    except PackageNotFoundError:
        solver_version = "unknown"
    return model.resolve, True, getattr(model, "__version__", solver_version)


resolve, SOLVER_AVAILABLE, SOLVER_VERSION = load_resolver()
KEEPALIVE_S = 2.0
# Each run takes 5 worker processes. Two, so that cancelling and re-running is not refused while the old run ends.
MAX_LIVE_SOLVES = 2
live_solves = threading.BoundedSemaphore(MAX_LIVE_SOLVES)


class SolveCancelled(Exception):
    """Stands in for solver.model.SolveCancelled when only the stub resolver loaded."""


if SOLVER_AVAILABLE:
    from solver.model import SolveCancelled


def load_precheck():
    try:
        return importlib.import_module("solver.model").precheck
    except ImportError:
        return lambda scenario, inputs: None


precheck = load_precheck()


def get_inputs() -> Inputs:
    try:
        return load_inputs()
    except FileNotFoundError:
        raise HTTPException(503, "Prepared data unavailable; run python data/prepare.py") from None


InputsDep = Annotated[Inputs, Depends(get_inputs)]


class ValidationRequest(ContractModel):
    scenario: Scenario
    solution: Solution


class ValidationResponse(AuditReport):
    run_id: str


class HealthResponse(ContractModel):
    run_id: str
    ok: bool
    available: bool
    solver_available: bool
    data_available: bool
    solver_version: str
    source: str


def validate_scenario(scenario: Scenario, inputs: Inputs):
    unknown = sorted(set(scenario.excluded_ids) - set(inputs.node_ids))
    if unknown:
        raise HTTPException(422, "Unknown excluded_ids: " + ", ".join(unknown))


def refuse_infeasible(scenario: Scenario, inputs: Inputs):
    """Answer at once with the reason when the inputs rule out every network, instead of starting a run."""
    if reason := precheck(scenario, inputs):
        raise HTTPException(422, reason)


def finish_run(result, scenario: Scenario, run_id: str, inputs: Inputs) -> Solution:
    result = Solution.model_validate(result).model_copy(deep=True)
    result.run_id = run_id
    result.validation = audit(scenario, result, inputs=inputs)
    return result


def resolve_live(scenario: Scenario, on_event, stop: threading.Event):
    if SOLVER_AVAILABLE:
        return resolve(scenario, on_event=on_event, stop=stop)
    return resolve(scenario)


def stream_solve(scenario: Scenario, run_id: str, inputs: Inputs):
    """Start a run holding a live_solves slot and return its NDJSON lines, ending in one result or error line.

    The work starts here and not in the generator, so a client that leaves before reading cannot strand the slot.
    A client that leaves while reading ends the solve.
    """
    loop = asyncio.get_running_loop()
    lines: asyncio.Queue[str | None] = asyncio.Queue()
    stop = threading.Event()
    started = time.monotonic()

    def post(event: dict) -> None:
        line = json.dumps({**event, "t": round(time.monotonic() - started, 3)}, separators=(",", ":"), allow_nan=False)
        loop.call_soon_threadsafe(lines.put_nowait, line)

    def work() -> None:
        try:
            result = resolve_live(scenario, post, stop)
            post({"type": "phase", "phase": "audit"})
            solution = finish_run(result, scenario, run_id, inputs)
            post({"type": "result", "solution": solution.model_dump(mode="json", by_alias=True)})
        except SolveCancelled:
            pass
        except Exception as exc:
            logging.getLogger(__name__).error("Run %s failed (%s)", run_id, type(exc).__name__)
            post({"type": "error", "run_id": run_id, "detail": "Run failed; see server logs using this run_id"})
        finally:
            live_solves.release()
            loop.call_soon_threadsafe(lines.put_nowait, None)

    async def read():
        try:
            while True:
                try:
                    line = await asyncio.wait_for(lines.get(), KEEPALIVE_S)
                except TimeoutError:
                    yield '{"type":"tick"}\n'
                    continue
                if line is None:
                    return
                yield line + "\n"
        finally:
            stop.set()

    threading.Thread(target=work, daemon=True).start()
    return read()


def create_app() -> FastAPI:
    app = FastAPI(title="Kalimantan SAF planner", version="1.0", debug=False)
    origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
    frontend_url = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
    if frontend_url:
        parsed = urlsplit(frontend_url)
        if parsed.scheme not in {"https", "http"} or not parsed.hostname or parsed.path or parsed.query or parsed.fragment or parsed.username or "*" in frontend_url:
            raise ValueError("FRONTEND_URL must be a single HTTP(S) origin")
        origins.append(frontend_url)
    app.add_middleware(
        CORSMiddleware, allow_origins=origins, allow_credentials=False,
        allow_methods=["GET", "POST"], allow_headers=["Content-Type"],
        expose_headers=["X-Run-ID"],
    )

    @app.middleware("http")
    async def identify_request(request: Request, call_next):
        request.state.run_id = str(uuid4())
        response = await call_next(request)
        response.headers["X-Run-ID"] = request.state.run_id
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException):
        return JSONResponse(status_code=exc.status_code, content={"run_id": request.state.run_id, "detail": exc.detail}, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request: Request, exc: RequestValidationError):
        # Omit echoed inputs: malformed values can include NaN or sensitive headers.
        detail = [{"loc": list(error["loc"]), "msg": error["msg"], "type": error["type"]} for error in exc.errors()]
        return JSONResponse(status_code=422, content={"run_id": request.state.run_id, "detail": detail})

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception):
        run_id = getattr(request.state, "run_id", str(uuid4()))
        logging.getLogger(__name__).error("Run %s failed (%s)", run_id, type(exc).__name__)
        return JSONResponse(status_code=500, content={"run_id": run_id, "detail": "Run failed; see server logs using this run_id"}, headers={"X-Run-ID": run_id})

    routes = APIRouter(prefix="/api")

    @routes.get("/health")
    def health(request: Request, inputs: Annotated[Inputs | None, Depends(optional_inputs)]) -> HealthResponse:
        available = SOLVER_AVAILABLE and inputs is not None
        return HealthResponse(run_id=request.state.run_id, ok=available, available=available, solver_available=SOLVER_AVAILABLE, data_available=inputs is not None, solver_version=SOLVER_VERSION, source="live" if SOLVER_AVAILABLE else "fixture")

    @routes.get("/data")
    def data(request: Request, inputs: InputsDep) -> dict:
        return {
            "run_id": request.state.run_id, "data_hash": inputs.data_hash,
            "sites": inputs.sites.to_dict("records"), "airports": inputs.airports.to_dict("records"),
            "node_ids": inputs.node_ids.tolist(), "hav_km": inputs.hav_km.tolist(),
            "road_km": inputs.road_km.tolist(), "is_candidate": inputs.is_candidate.tolist(),
            "defaults": Scenario().model_dump(mode="json", by_alias=True),
        }

    @routes.post("/validate")
    def validate(body: ValidationRequest, request: Request, inputs: InputsDep) -> ValidationResponse:
        validate_scenario(body.scenario, inputs)
        report = audit(body.scenario, body.solution, inputs=inputs)
        return ValidationResponse(run_id=request.state.run_id, **report.model_dump())

    @routes.post("/solve")
    def solve(scenario: Scenario, request: Request, inputs: InputsDep) -> Solution:
        validate_scenario(scenario, inputs)
        validate_scenario(scenario, inputs)
        refuse_infeasible(scenario, inputs)
        return finish_run(resolve(scenario), scenario, request.state.run_id, inputs)

    @routes.post("/solve/stream")
    async def solve_stream(scenario: Scenario, request: Request, inputs: InputsDep) -> StreamingResponse:
        validate_scenario(scenario, inputs)
        refuse_infeasible(scenario, inputs)
        if not live_solves.acquire(blocking=False):
            raise HTTPException(429, "The solver is busy with another run. Try again when it finishes")
        return StreamingResponse(stream_solve(scenario, request.state.run_id, inputs), media_type="application/x-ndjson",
                                 headers={"X-Accel-Buffering": "no"})

    @routes.post("/baseline")
    def greedy(scenario: Scenario, request: Request, inputs: InputsDep) -> Solution:
        validate_scenario(scenario, inputs)
        refuse_infeasible(scenario, inputs)
        result = baseline(scenario, inputs=inputs)
        result.run_id = request.state.run_id
        return result

    @routes.post("/plain-english")
    def plain_english_route(body: ExplainRequest, request: Request) -> ExplainResponse:
        text, model = plain_english(body.kind, body.facts)
        return ExplainResponse(run_id=request.state.run_id, text=text, model=model)

    app.include_router(routes)
    app.include_router(explain_router)
    return app


def optional_inputs() -> Inputs | None:
    try:
        return get_inputs()
    except HTTPException:
        return None


app = create_app()
