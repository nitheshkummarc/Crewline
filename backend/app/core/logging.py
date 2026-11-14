"""JSON logging setup.

Contents:
    JsonFormatter: Format log records as one JSON line.
    JsonFormatter.format: Return the record as a JSON string with extra fields included.
    configure_logging: Install the JSON formatter on the root logger.
"""

import logging
import sys
import time

import orjson

_STANDARD = set(logging.LogRecord("", 0, "", 0, "", None, None).__dict__) | {"message", "asctime"}


class JsonFormatter(logging.Formatter):
    """Format log records as one JSON line."""

    def format(self, record: logging.LogRecord) -> str:
        """Return the record as a JSON string with extra fields included."""
        data = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created)),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in _STANDARD and not key.startswith("_"):
                data[key] = value
        if record.exc_info:
            data["exc"] = self.formatException(record.exc_info)
        return orjson.dumps(data, default=str).decode()


def configure_logging(level: str) -> None:
    """Install the JSON formatter on the root logger."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level.upper())
