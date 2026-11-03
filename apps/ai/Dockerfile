FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY apps/ai/requirements.txt .
# pyswisseph builds from source (C + C++); drop build toolchain after install.
RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential \
  && pip install --no-cache-dir -r requirements.txt \
  && apt-get purge -y build-essential \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*
COPY apps/ai/app ./app
RUN mkdir -p /data && useradd --uid 10001 --create-home ai && chown ai /data
USER ai
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
