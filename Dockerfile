# ============================================================
# Stage 1: Build frontend
# ============================================================
FROM node:22-alpine AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ============================================================
# Stage 2: Production image
# ============================================================
FROM python:3.14-slim AS production
WORKDIR /app

# Create non-root user and writable data directory
RUN useradd -r -s /bin/false appuser && mkdir -p /data && chown appuser:appuser /data

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
ENV DENON_DASHBOARD_DATA_DIR=/data

VOLUME ["/data"]

EXPOSE 8080

# Switch to non-root user
USER appuser

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import sys, urllib.request; \
r = urllib.request.urlopen('http://localhost:' + __import__('os').environ.get('DENON_DASHBOARD_PORT', '8080') + '/api/v1/health', timeout=2); \
sys.exit(0 if 200 <= r.getcode() < 300 else 1)" || exit 1

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${DENON_DASHBOARD_PORT} --log-level info"]
