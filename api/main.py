"""Thin local solver API. Start with uvicorn api.main:app --port 8000."""

import importlib
from importlib.metadata import PackageNotFoundError, version
import logging
import os
from typing import Annotated
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from api.auth import require_user
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
        allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type"],
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

    public = APIRouter(prefix="/api")
    protected = APIRouter(prefix="/api", dependencies=[Depends(require_user)])

    @public.get("/health")
    def health(request: Request, inputs: Annotated[Inputs | None, Depends(optional_inputs)]) -> HealthResponse:
        available = SOLVER_AVAILABLE and inputs is not None
        return HealthResponse(run_id=request.state.run_id, ok=available, available=available, solver_available=SOLVER_AVAILABLE, data_available=inputs is not None, solver_version=SOLVER_VERSION, source="live" if SOLVER_AVAILABLE else "fixture")

    @public.get("/data")
    def data(request: Request, inputs: InputsDep) -> dict:
        return {
            "run_id": request.state.run_id, "data_hash": inputs.data_hash,
            "sites": inputs.sites.to_dict("records"), "airports": inputs.airports.to_dict("records"),
            "node_ids": inputs.node_ids.tolist(), "hav_km": inputs.hav_km.tolist(),
            "road_km": inputs.road_km.tolist(), "is_candidate": inputs.is_candidate.tolist(),
            "defaults": Scenario().model_dump(mode="json", by_alias=True),
        }

    @public.post("/validate")
    def validate(body: ValidationRequest, request: Request, inputs: InputsDep) -> ValidationResponse:
        validate_scenario(body.scenario, inputs)
        report = audit(body.scenario, body.solution, inputs=inputs)
        return ValidationResponse(run_id=request.state.run_id, **report.model_dump())

    @protected.post("/solve")
    def solve(scenario: Scenario, request: Request, inputs: InputsDep) -> Solution:
        validate_scenario(scenario, inputs)
        result = Solution.model_validate(resolve(scenario)).model_copy(deep=True)
        result.run_id = request.state.run_id
        result.validation = audit(scenario, result, inputs=inputs)
        return result

    @protected.post("/baseline")
    def greedy(scenario: Scenario, request: Request, inputs: InputsDep) -> Solution:
        validate_scenario(scenario, inputs)
        result = baseline(scenario, inputs=inputs)
        result.run_id = request.state.run_id
        return result

    app.include_router(public)
    app.include_router(protected)
    return app


def optional_inputs() -> Inputs | None:
    try:
        return get_inputs()
    except HTTPException:
        return None


app = create_app()
