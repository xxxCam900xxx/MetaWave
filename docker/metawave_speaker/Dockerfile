FROM python:3.12-slim

ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu
RUN apt-get update && apt-get install -y --no-install-recommends libsndfile1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY app/metawave_speaker/requirements.txt .
RUN pip install --no-cache-dir torch==2.6.0 torchaudio==2.6.0 --index-url "$TORCH_INDEX_URL" \
    && pip install --no-cache-dir -r requirements.txt
RUN apt-get update && apt-get install -y --no-install-recommends sox && rm -rf /var/lib/apt/lists/*
COPY app/metawave_speaker/*.py ./
ENV PYTHONUNBUFFERED=1
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8010"]
