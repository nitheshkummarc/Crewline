"""Settings loaded from environment variables."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed settings with defaults from architecture.md section 14."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    database_listen_url: str | None = None
    jwt_secret: str
    jwt_ttl_min: int = 120
    cookie_secure: bool = True
    read_pool_max: int = 10
    write_pool_max: int = 10
    pool_acquire_timeout_s: float = 1.0
    write_inflight_max: int = 30
    board_cache_ttl_ms: int = 1000
    sse_heartbeat_s: float = 15.0
    sse_max_streams_per_user: int = 3
    rate_code_per_user_min: int = 5
    rate_code_per_ip_min: int = 20
    rate_login_per_min: int = 5
    rate_signup_per_hour: int = 10
    rate_mutations_per_min: int = 60
    lab_enabled: bool = True
    lab_max_attempts: int = 200
    rate_lab_per_min: int = 6
    rate_lab_global_per_hour: int = 120
    idempotency_ttl_h: int = 24
    log_level: str = "INFO"
    # Header set by the host's edge with the real client IP (Render: cf-connecting-ip); empty = socket peer.
    client_ip_header: str = ""
    web_dist_dir: str = "frontend/dist"

    @property
    def listen_url(self) -> str:
        """Return the connection string used for LISTEN."""
        return self.database_listen_url or self.database_url


@lru_cache
def get_settings() -> Settings:
    """Return the cached Settings instance."""
    return Settings()  # type: ignore[call-arg]
