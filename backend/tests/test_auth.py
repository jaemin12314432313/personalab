from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, update

from app.core.config import AUTH_COOKIE, AUTH_RATE_MAX_ATTEMPTS
from app.core.db import get_session
from app.main import app
from app.models import AuthSession, User, UserCredential
from app.services.auth import token_digest, verify_password

PASSWORD = "a-test-password-with-length"


@pytest.fixture
async def auth_client(session):
    app.dependency_overrides[get_session] = lambda: session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers={"X-Requested-With": "PersonaLab"}) as client:
        yield client
    app.dependency_overrides.clear()


async def signup(client, email="member@example.com"):
    response = await client.post("/auth/register", json={"email": email, "password": PASSWORD})
    assert response.status_code == 201
    return response


async def test_registration_session_and_revoked_logout(auth_client, session):
    response = await signup(auth_client, " Member@Example.COM ")
    assert response.json()["email"] == "member@example.com"
    assert "httponly" in response.headers["set-cookie"].lower()
    assert "samesite=lax" in response.headers["set-cookie"].lower()
    token = auth_client.cookies[AUTH_COOKIE]
    credential = await session.get(UserCredential, response.json()["id"])
    assert credential.password_hash != PASSWORD
    assert verify_password(credential.password_hash, PASSWORD)
    assert await session.get(AuthSession, token_digest(token)) is not None
    assert await session.get(AuthSession, token) is None
    assert (await auth_client.get("/auth/me")).status_code == 200
    assert (await auth_client.post("/studies", json={"name": "나의 스터디"})).status_code == 201
    assert (await auth_client.post("/auth/logout")).status_code == 200
    assert (await auth_client.get("/auth/me")).status_code == 401
    assert (await auth_client.get("/studies", headers={"Cookie": f"{AUTH_COOKIE}={token}"})).status_code == 401


async def test_login_rotates_session_and_preserves_server_studies(auth_client):
    await signup(auth_client)
    old_token = auth_client.cookies[AUTH_COOKIE]
    study = (await auth_client.post("/studies", json={"name": "내 기록"})).json()
    logged = await auth_client.post("/auth/login", json={"email": "member@example.com", "password": PASSWORD})
    assert logged.status_code == 200
    assert auth_client.cookies[AUTH_COOKIE] != old_token
    assert (await auth_client.get("/studies", headers={"Cookie": f"{AUTH_COOKIE}={old_token}"})).status_code == 401
    assert any(row["id"] == study["id"] for row in (await auth_client.get("/studies")).json())


async def test_wrong_credentials_and_absent_session_are_rejected(auth_client):
    assert (await auth_client.get("/studies")).status_code == 401
    await signup(auth_client)
    wrong = await auth_client.post("/auth/login", json={"email": "member@example.com", "password": "wrong-password-is-long"})
    unknown = await auth_client.post("/auth/login", json={"email": "unknown@example.com", "password": "wrong-password-is-long"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


async def test_accounts_cannot_access_each_others_studies(auth_client):
    await signup(auth_client, "first@example.com")
    study = (await auth_client.post("/studies", json={"name": "비공개 스터디"})).json()
    await auth_client.post("/auth/logout")
    await signup(auth_client, "second@example.com")
    assert (await auth_client.get(f"/studies/{study['id']}")).status_code == 404
    assert (await auth_client.get(f"/studies/{study['id']}/report")).status_code == 404
    assert (await auth_client.get("/studies")).json() == []


async def test_expired_session_is_rejected(auth_client, session):
    await signup(auth_client)
    token = auth_client.cookies[AUTH_COOKIE]
    await session.execute(update(AuthSession).where(AuthSession.token_hash == token_digest(token)).values(expires_at=datetime.now(timezone.utc) - timedelta(seconds=1)))
    await session.commit()
    assert (await auth_client.get("/auth/me")).status_code == 401


async def test_csrf_headers_and_origin_are_required(auth_client):
    payload = {"email": "member@example.com", "password": PASSWORD}
    assert (await auth_client.post("/auth/register", json=payload, headers={"X-Requested-With": ""})).status_code == 403
    assert (await auth_client.post("/auth/register", json=payload, headers={"Origin": "https://evil.example"})).status_code == 403
    assert (await auth_client.post("/auth/register", json=payload, headers={"Origin": "http://127.0.0.1:5173"})).status_code == 201
    assert (await auth_client.post("/auth/logout", headers={"X-Requested-With": ""})).status_code == 403
    assert (await auth_client.get("/auth/me")).status_code == 200


async def test_login_attempts_are_limited(auth_client):
    for _ in range(AUTH_RATE_MAX_ATTEMPTS):
        assert (await auth_client.post("/auth/login", json={"email": "missing@example.com", "password": PASSWORD})).status_code == 401
    limited = await auth_client.post("/auth/login", json={"email": "missing@example.com", "password": PASSWORD})
    assert limited.status_code == 429 and "retry-after" in limited.headers


async def test_validation_does_not_echo_password_and_legacy_accounts_are_not_claimed(auth_client, session):
    short = "abc"
    error = await auth_client.post("/auth/register", json={"email": "member@example.com", "password": short})
    assert error.status_code == 422 and short not in error.text
    session.add(User(email="legacy@example.com")); await session.commit()
    result = await auth_client.post("/auth/register", json={"email": "legacy@example.com", "password": PASSWORD})
    assert result.status_code == 409


async def test_https_session_cookie_is_secure(session):
    app.dependency_overrides[get_session] = lambda: session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="https://test", headers={"X-Requested-With": "PersonaLab"}) as client:
            response = await signup(client)
            assert "; secure" in response.headers["set-cookie"].lower()
    finally:
        app.dependency_overrides.clear()


async def test_four_character_password_signup_and_login(auth_client):
    payload = {"email": "four-characters@example.com", "password": "ab12"}
    too_short = await auth_client.post("/auth/register", json={**payload, "password": "ab1"})
    assert too_short.status_code == 422
    assert (await auth_client.post("/auth/register", json=payload)).status_code == 201
    await auth_client.post("/auth/logout")
    assert (await auth_client.post("/auth/login", json=payload)).status_code == 200
