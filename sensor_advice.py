"""Neutral sensor metadata; this module does not classify agronomic readings."""

import math
import time


# These are the fields reported by the device. No crop or sensor thresholds are
# configured here; FERT is retained as the sensor's fertility indicator.
SENSOR_FIELDS = {
    "hum": {"label": "Humedad", "unit": "%"},
    "temp": {"label": "Temperatura", "unit": "°C"},
    "ec": {"label": "Conductividad eléctrica (EC)", "unit": "µS/cm"},
    "ph": {"label": "pH", "unit": ""},
    "n": {"label": "Nitrógeno (N)", "unit": "mg/kg"},
    "p": {"label": "Fósforo (P)", "unit": "mg/kg"},
    "k": {"label": "Potasio (K)", "unit": "mg/kg"},
    "fert": {"label": "Fertilidad (FERT)", "unit": ""},
}

READING_MAX_AGE_SECONDS = 10

_SOURCE_LABELS = {
    "live": "En vivo",
    "test": "Lectura histórica",
    "demo": "Demostración",
    "stale": "Desactualizada",
    "disconnected": "Sin conexión",
    "waiting": "Esperando lectura",
}


def _number(value):
    if isinstance(value, bool) or value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _format(value):
    number = float(value)
    if number.is_integer():
        return str(int(number))
    return f"{number:.1f}"


def _source(reading, now):
    if reading.get("test_mode") is True:
        received_at = _number(reading.get("_received_at"))
        age = max(0, now - received_at) if received_at is not None else None
        sample_id = int(received_at * 1000) if received_at is not None else None
        return "test", age, sample_id

    if reading.get("debug") is True:
        received_at = _number(reading.get("_received_at"))
        age = max(0, now - received_at) if received_at is not None else None
        sample_id = int(received_at * 1000) if received_at is not None else None
        return "demo", age, sample_id

    received_at = _number(reading.get("_received_at"))
    if received_at is None:
        return ("disconnected" if reading.get("connected") is not True else "waiting"), None, None

    age = max(0, now - received_at)
    if age > READING_MAX_AGE_SECONDS:
        return "stale", age, int(received_at * 1000)
    if reading.get("connected") is not True:
        return "disconnected", age, int(received_at * 1000)
    return "live", age, int(received_at * 1000)


def build_sensor_assessment(reading, now=None):
    """Return source metadata and raw values without agronomic judgments."""
    reading = reading if isinstance(reading, dict) else {}
    now = time.time() if now is None else now
    source, age, sample_id = _source(reading, now)
    metrics = {}

    for key, spec in SENSOR_FIELDS.items():
        value = _number(reading.get(key))
        metrics[key] = {
            "label": spec["label"],
            "unit": spec["unit"],
            "value": value,
            "display_value": _format(value) if value is not None else None,
        }

    return {
        "source": source,
        "source_label": _SOURCE_LABELS[source],
        "context_note": "Lectura histórica antes de fertilizar; no es en vivo." if source == "test" else None,
        "age_seconds": round(age, 1) if age is not None else None,
        "sample_id": sample_id,
        "metrics": metrics,
    }
