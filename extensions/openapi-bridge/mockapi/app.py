"""Tiny mock REST API used to exercise the OpenAPI -> codemode bridge.

Run:  .venv/bin/uvicorn app:app --host 127.0.0.1 --port 8077
Spec: http://127.0.0.1:8077/openapi.json
Auth: Authorization: Bearer test-token   (everything except /health)
"""

import time
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.security import APIKeyHeader, APIKeyQuery, HTTPBearer
from pydantic import BaseModel, Field

TOKEN = "test-token"
API_KEY = "key-123"

app = FastAPI(
    title="Bridge Mock API",
    version="1.0.0",
    servers=[{"url": "http://127.0.0.1:8077"}],
)

# Declared security schemes: these land in components.securitySchemes and each
# protected operation gets `security: [{HTTPBearer: []}, {APIKeyHeader: []}, {APIKeyQuery: []}]`
# (a list of alternatives, i.e. OR). Swagger UI renders them as the Authorize dialog.
bearer_scheme = HTTPBearer(auto_error=False, description="Static demo token: test-token")
header_scheme = APIKeyHeader(name="X-Api-Key", auto_error=False, description="Demo key: key-123")
query_scheme = APIKeyQuery(name="api_key", auto_error=False, description="Demo key: key-123")


def require_token(
    bearer=Depends(bearer_scheme),
    header_key=Depends(header_scheme),
    query_key=Depends(query_scheme),
) -> None:
    if bearer is not None and bearer.credentials == TOKEN:
        return
    if header_key is not None and header_key == API_KEY:
        return
    if query_key is not None and query_key == API_KEY:
        return
    raise HTTPException(
        status_code=401,
        detail="invalid or missing credential",
        headers={"WWW-Authenticate": "Bearer"},
    )


class PetIn(BaseModel):
    name: str = Field(description="Pet display name")
    status: Literal["available", "pending", "sold"] = "available"
    tags: list[str] = []


class Pet(PetIn):
    id: int


# 250 pets so list endpoints return a payload big enough to be worth filtering.
STATUSES = ["available", "pending", "sold"]
PETS: dict[int, Pet] = {
    i: Pet(
        id=i,
        name=f"pet-{i:03d}",
        status=STATUSES[i % 3],
        tags=["seed", f"group-{i % 5}"],
    )
    for i in range(1, 251)
}


@app.get("/health", operation_id="health", tags=["meta"])
def health() -> dict:
    """Unauthenticated liveness probe."""
    return {"ok": True, "pets": len(PETS)}


@app.get("/whoami", operation_id="whoami", tags=["meta"])
def whoami(
    bearer=Depends(bearer_scheme),
    header_key=Depends(header_scheme),
    query_key=Depends(query_scheme),
) -> dict:
    """Report which declared security scheme the caller satisfied (never echoes secrets)."""
    seen = []
    if bearer is not None:
        seen.append("HTTPBearer:valid" if bearer.credentials == TOKEN else "HTTPBearer:wrong")
    if header_key is not None:
        seen.append("APIKeyHeader:valid" if header_key == API_KEY else "APIKeyHeader:wrong")
    if query_key is not None:
        seen.append("APIKeyQuery:valid" if query_key == API_KEY else "APIKeyQuery:wrong")
    return {"authenticated": bool(seen) and all(s.endswith("valid") for s in seen), "seen": seen or ["none"]}


@app.get("/pets/search", operation_id="search_pets", tags=["pets"])
def search_pets(
    q: str = Query(description="Substring match on the pet name"),
    limit: int = Query(default=10, ge=1, le=100),
    _: None = Depends(require_token),
) -> dict:
    """Search pet names by substring."""
    hits = [p for p in PETS.values() if q.lower() in p.name.lower()][:limit]
    return {"query": q, "count": len(hits), "items": hits}


@app.get("/pets", operation_id="list_pets", tags=["pets"])
def list_pets(
    limit: int = Query(default=20, ge=1, le=500, description="Max items to return"),
    status: Literal["available", "pending", "sold"] | None = Query(
        default=None, description="Filter by status"
    ),
    tags: list[str] | None = Query(default=None, description="Require all of these tags"),
    _: None = Depends(require_token),
) -> dict:
    """List pets, newest ids first."""
    items = sorted(PETS.values(), key=lambda p: -p.id)
    if status:
        items = [p for p in items if p.status == status]
    if tags:
        items = [p for p in items if all(t in p.tags for t in tags)]
    return {"total": len(items), "items": items[:limit]}


@app.post("/pets", operation_id="create_pet", status_code=201, tags=["pets"])
def create_pet(pet: PetIn, _: None = Depends(require_token)) -> Pet:
    """Create a pet."""
    new_id = max(PETS) + 1
    created = Pet(id=new_id, **pet.model_dump())
    PETS[new_id] = created
    return created


@app.get("/pets/{pet_id}", operation_id="get_pet", tags=["pets"])
def get_pet(pet_id: int, _: None = Depends(require_token)) -> Pet:
    """Fetch one pet by id."""
    if pet_id not in PETS:
        raise HTTPException(404, f"pet {pet_id} not found")
    return PETS[pet_id]


@app.put("/pets/{pet_id}", operation_id="update_pet", tags=["pets"])
def update_pet(pet_id: int, pet: PetIn, _: None = Depends(require_token)) -> Pet:
    """Replace a pet's mutable fields."""
    if pet_id not in PETS:
        raise HTTPException(404, f"pet {pet_id} not found")
    updated = Pet(id=pet_id, **pet.model_dump())
    PETS[pet_id] = updated
    return updated


@app.delete("/pets/{pet_id}", operation_id="delete_pet", status_code=204, tags=["pets"])
def delete_pet(pet_id: int, _: None = Depends(require_token)) -> None:
    """Delete a pet."""
    if PETS.pop(pet_id, None) is None:
        raise HTTPException(404, f"pet {pet_id} not found")


@app.get("/boom", operation_id="boom", tags=["meta"])
def boom(_: None = Depends(require_token)) -> dict:
    """Always fails with 500, for error-path testing."""
    raise HTTPException(500, "intentional server error")


@app.get("/slow", operation_id="slow", tags=["meta"])
def slow(seconds: float = Query(default=2.0, le=30), _: None = Depends(require_token)) -> dict:
    """Sleeps, for timeout testing."""
    time.sleep(seconds)
    return {"slept": seconds}
