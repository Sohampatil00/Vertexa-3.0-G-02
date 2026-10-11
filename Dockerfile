FROM node:22-bookworm-slim AS frontend
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.12-slim-bookworm AS runtime
COPY --from=ghcr.io/astral-sh/uv:0.12.23 /uv /usr/local/bin/uv
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"
COPY pyproject.toml uv.lock README.md alembic.ini ./
COPY govfix/ ./govfix/
COPY migrations/ ./migrations/
COPY config/ ./config/
COPY scripts/render_start.py ./scripts/render_start.py
RUN uv sync --locked --no-dev && \
    useradd --uid 10001 --create-home govfix && \
    mkdir -p /app/var && chown govfix:govfix /app/var
COPY --from=frontend /app/govfix/static/ ./govfix/static/
USER govfix
EXPOSE 10000
CMD ["python", "scripts/render_start.py", "web"]
