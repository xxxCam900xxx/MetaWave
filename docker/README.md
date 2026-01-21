# How to start the project

- [How to start the project](#how-to-start-the-project)
  - [Step 0 | Install Docker](#step-0--install-docker)
  - [Step 1 | Create Enviroment Files](#step-1--create-enviroment-files)
  - [Step 2 | Start Containers](#step-2--start-containers)
  - [Step 3 | Start Coding!](#step-3--start-coding)

## Step 0 | Install Docker

Install Docker Desktop on your System:
- https://www.docker.com/products/docker-desktop/

```bash
# To verify the presence of Docker
docker compose version
```

> [!IMPORTANT]
> - Make sure Docker is running before continuing.
> - You need Docker Compose v2.20+ for the include feature.

## Step 1 | Create Enviroment Files

Create in the `/docker/metawave_app` directory a `.env` File with the following Variables:

```.env
# For local development, you can use localhost
API_DOMAIN_URL=<http://localhost:8000>
```

## Step 2 | Start Containers

Use the following command in the `docker` directory:

```bash
docker compose -f compose.enviroment.yaml up --build
```

This will create all the Containers

## Step 3 | Start Coding!

The following Ports are gonna be used:
- `:8000` -> (API) | [Radio & Auth Service](http://localhost:8000)
- `:80` -> (Client) | [WebApp](http://localhost:80)