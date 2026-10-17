FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY apps/ai/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/ai/app ./app
RUN mkdir -p /data && useradd --uid 10001 --create-home ai && chown ai /data
USER ai
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
