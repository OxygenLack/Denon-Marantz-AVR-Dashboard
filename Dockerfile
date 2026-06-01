# ============================================================
# Stage 1: Build frontend
# ============================================================
FROM node:22-alpine AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ============================================================
# Stage 2: Production image
# ============================================================
FROM python:3.13-slim AS production
WORKDIR /app

# Create non-root user
RUN useradd -r -s /bin/false appuser
RUN apt-get update \
    && apt-get install -y --no-install-recommends android-tools-adb \
    && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /data/androidtv /data/adb && chown -R appuser /data

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ .

# Copy built frontend
COPY --from=frontend-build /build/dist /app/static

# Environment
ENV STATIC_DIR=/app/static
ENV PYTHONUNBUFFERED=1
ENV DENON_DASHBOARD_PORT=8080

EXPOSE 8080

# Switch to non-root user
USER appuser

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${DENON_DASHBOARD_PORT:-8080}/api/v1/health')" || exit 1

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${DENON_DASHBOARD_PORT} --log-level info"]
