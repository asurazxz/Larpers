import pytest


@pytest.fixture(autouse=True)
def require_login(monkeypatch):
    # The auth tests check the login path, which is off by default at runtime.
    monkeypatch.setenv("REQUIRE_LOGIN", "1")


def pytest_configure(config):
    config.addinivalue_line("markers", "slow: solves real data")
