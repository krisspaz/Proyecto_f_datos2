# Proyecto final — datos II

## Cómo levantar el sistema

1. Clonar el repositorio y entrar a la carpeta del proyecto.

2. Crear el archivo de variables:

   ```bash
   cp .env.example .env
   ```

3. Levantar todo con Docker:

   ```bash
   docker compose up --build
   ```

   La primera vez puede tardar un poco mientras las imágenes se construyen y los servicios pasan los healthchecks.

## Qué queda disponible

| Servicio    | URL / puerto        |
|------------|---------------------|
| API        | http://localhost:4000 |
| Frontend   | http://localhost:8080 |
| Grafana    | http://localhost:3001 (usuario y contraseña: los de tu `.env`) |
| RabbitMQ UI| http://localhost:15672 (mismo usuario/contraseña que en `.env`) |
| InfluxDB   | http://localhost:8086 |
| MinIO      | consola en http://localhost:9001 |

Comprueba que la API responde: http://localhost:4000/health

## Eventos (API)

- `POST /api/events/impression`, `POST /api/events/click`, `POST /api/events/conversion` — cuerpo JSON según el enunciado; respuesta **202** con `{ "accepted": true }` si el mensaje se publicó en RabbitMQ.
- Si faltan campos obligatorios o el JSON es inválido, la API responde **400** (detalle en el cuerpo de error de Fastify).


- No subas el archivo `.env` al repositorio; solo existe `.env.example` como plantilla.
- Los valores de `.env.example` son para desarrollo local; cámbialos si expones algo a red pública.
