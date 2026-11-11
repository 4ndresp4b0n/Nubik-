# Imagen de producción de la tienda NUBIK (solo librería estándar de Python).
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    NUBIK_DATA_DIR=/data
WORKDIR /app
COPY server.py payments.py admin.py antispam.py ./
COPY config ./config
COPY public ./public
# Los volúmenes de Railway/Render se montan como root: el proceso corre como root dentro del contenedor.
RUN mkdir -p /data
EXPOSE 8000
CMD ["python", "server.py"]
