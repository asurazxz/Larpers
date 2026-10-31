"""Verify Supabase access tokens; never read a private key or a dotenv file."""

import os
from functools import lru_cache
from typing import Annotated
from urllib.parse import urlsplit

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

bearer = HTTPBearer(auto_error=False)
ALGORITHMS = ("RS256", "ES256")


@lru_cache(maxsize=8)
def get_jwks_client(supabase_url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(
        supabase_url.rstrip("/") + "/auth/v1/.well-known/jwks.json",
        cache_jwk_set=True, lifespan=300, cache_keys=True, timeout=5,
    )


def require_user(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]) -> dict:
    denied = HTTPException(status_code=401, detail="A valid signed-in session is required", headers={"WWW-Authenticate": "Bearer"})
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise denied
    supabase_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    try:
        parsed = urlsplit(supabase_url)
        # Remote JWKS must use TLS. Local Supabase's loopback HTTP remains usable.
        transport_ok = parsed.scheme == "https" or (parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"})
        configured = transport_ok and bool(parsed.hostname) and not (parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment)
    except ValueError:
        configured = False
    if not configured:
        raise HTTPException(status_code=503, detail="API authentication is not configured")
    try:
        header = jwt.get_unverified_header(credentials.credentials)
        if header.get("alg") not in ALGORITHMS or not isinstance(header.get("kid"), str) or not header["kid"]:
            raise denied
        signing_key = get_jwks_client(supabase_url).get_signing_key_from_jwt(credentials.credentials)
        claims = jwt.decode(
            credentials.credentials, signing_key.key, algorithms=list(ALGORITHMS),
            audience="authenticated", issuer=supabase_url + "/auth/v1",
            options={"require": ["exp", "aud", "iss", "sub"]},
        )
        if not isinstance(claims["sub"], str) or not claims["sub"]:
            raise denied
        return claims
    except (jwt.InvalidTokenError, jwt.PyJWKClientError, ValueError, TypeError):
        raise denied from None


# Legacy HS256 projects: rotate to asymmetric signing keys, or explicitly add a
# SUPABASE_JWT_SECRET branch. Never accept HS256 using a public JWKS key.
