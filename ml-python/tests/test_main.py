"""
Tests for SmartCity ML Service.
Covers: AQI conversion, /health endpoint, /predict validation.
"""

import math
import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# pm25_to_aqi unit tests
# ---------------------------------------------------------------------------

class TestPm25ToAqi:
    """Test EPA 2024 revised AQI breakpoints."""

    @pytest.fixture(autouse=True)
    def _import_fn(self):
        from services.ml_model import pm25_to_aqi
        self.pm25_to_aqi = pm25_to_aqi

    @pytest.mark.parametrize("pm25, expected", [
        (0.0, 0),
        (3.0, 17),
        (5.0, 28),
        (9.0, 50),
        (9.05, 50),       # truncation: 9.05 -> 9.0
        (9.1, 51),
        (20.0, 71),
        (35.4, 100),
        (35.5, 101),
        (45.0, 124),
        (55.4, 150),
        (55.5, 151),
        (90.0, 175),
        (125.4, 200),
        (125.5, 201),
        (225.4, 300),
        (225.5, 301),
        (325.4, 400),
        (325.5, 401),
        (500.4, 500),
    ])
    def test_known_values(self, pm25: float, expected: int):
        assert self.pm25_to_aqi(pm25) == expected

    def test_negative_returns_zero(self):
        assert self.pm25_to_aqi(-5.0) == 0

    def test_nan_returns_zero(self):
        assert self.pm25_to_aqi(float('nan')) == 0

    def test_above_scale_capped(self):
        assert self.pm25_to_aqi(600.0) == 500
        assert self.pm25_to_aqi(1000.0) == 500

    def test_monotonic(self):
        """AQI must not decrease as PM2.5 increases."""
        prev = 0
        for i in range(0, 5005):
            pm25 = i / 10.0
            aqi = self.pm25_to_aqi(pm25)
            assert aqi >= prev, f"AQI decreased from {prev} to {aqi} at PM2.5={pm25}"
            prev = aqi

    def test_range(self):
        """AQI always in [0, 500]."""
        for i in range(-100, 6001):
            pm25 = i / 10.0
            aqi = self.pm25_to_aqi(pm25)
            assert 0 <= aqi <= 500, f"pm25_to_aqi({pm25}) = {aqi}"


# ---------------------------------------------------------------------------
# /health endpoint
# ---------------------------------------------------------------------------

class TestHealthEndpoint:
    def test_health_returns_ok(self):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["service"] == "smartcity-ml"
        assert data["version"] == "2.0.0"
        assert "ml_model_trained" in data
        assert "sklearn_available" in data


# ---------------------------------------------------------------------------
# /predict validation
# ---------------------------------------------------------------------------

class TestPredictValidation:
    def test_empty_body_accepted(self):
        """Empty body should work (all fields optional)."""
        resp = client.post("/predict", json={})
        # Should not be 422; may be 200 or 500 depending on Groq availability
        assert resp.status_code != 422

    def test_invalid_date_rejected(self):
        resp = client.post("/predict", json={"date": "not-a-date"})
        assert resp.status_code == 422

    def test_valid_date_accepted(self):
        resp = client.post("/predict", json={"date": "2025-06-15"})
        assert resp.status_code != 422

    def test_empty_date_treated_as_none(self):
        """Go sends empty string for date; should not cause 422."""
        resp = client.post("/predict", json={"date": ""})
        assert resp.status_code != 422

    def test_invalid_language_rejected(self):
        resp = client.post("/predict", json={"language": "fr"})
        assert resp.status_code == 422

    def test_valid_languages(self):
        for lang in ("ru", "en", "kk"):
            resp = client.post("/predict", json={"language": lang})
            assert resp.status_code != 422, f"Language '{lang}' should be accepted"

    def test_empty_language_treated_as_none(self):
        resp = client.post("/predict", json={"language": ""})
        assert resp.status_code != 422

    def test_temperature_out_of_range(self):
        resp = client.post("/predict", json={"temperature": 100.0})
        assert resp.status_code == 422

    def test_query_too_long(self):
        resp = client.post("/predict", json={"query": "x" * 2001})
        assert resp.status_code == 422

    def test_aqi_out_of_range(self):
        resp = client.post("/predict", json={"live_aqi": 501})
        assert resp.status_code == 422
