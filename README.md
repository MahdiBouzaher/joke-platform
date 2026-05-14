# Joke Platform

A cloud-native microservices platform for submitting, moderating, and serving jokes, deployed across multiple Azure regions with full API gateway, message queuing, dual-database support, and OIDC authentication.


---

## Overview

Joke Platform is a production-grade distributed system built around independently deployable services. Each service has a single responsibility and communicates either via REST (through the API gateway) or asynchronously via a message broker. The platform supports user authentication, joke submission, content moderation, and retrieval - all secured behind a single public entrypoint.

---

## Architecture

```
                        Internet
                           │
                    ┌──────▼──────┐
                    │  Kong VM    │  ← Only public-facing VM
                    │ API Gateway │    TLS via Let's Encrypt
                    │  + DuckDNS  │
                    └──────┬──────┘
                           │ Private VNet (VNet Peering)
          ┌────────────────┼────────────────┐
          │                │                │
   ┌──────▼──────┐  ┌──────▼──────┐  ┌─────▼───────┐
   │  Joke VM    │  │  Submit VM  │  │ Moderate VM │
   │  (MySQL +   │  │  (Node.js)  │  │  (Node.js)  │
   │   MongoDB)  │  └──────┬──────┘  └─────┬───────┘
   └─────────────┘         │               │
                    ┌──────▼──────┐        │
                    │ RabbitMQ VM │◄───────┘
                    │  (Broker)   │
                    └─────────────┘

  Region 1: Norway East     Region 2: Sweden Central
  (Kong, Joke, Submit)      (Moderate, RabbitMQ)
```

Five VMs across two Azure regions, connected via VNet peering. Kong is the sole externally accessible VM — all others sit on private IPs only.

---

## Services

| Service | Responsibility |
|---|---|
| **Kong** | API gateway, TLS termination, routing, OIDC enforcement |
| **Joke Service** | Serves approved jokes; supports MySQL and MongoDB (switchable) |
| **Submit Service** | Accepts joke submissions from authenticated users |
| **Moderate Service** | Reviews and approves/rejects submitted jokes |
| **RabbitMQ** | Async message broker between Submit and Moderate |

---

## Tech Stack

**Infrastructure**
- Microsoft Azure (5 VMs, 2 regions)
- Terraform (IaC — declarative provisioning and VNet peering)
- Docker + Docker Compose (per-VM container orchestration)

**API Gateway**
- Kong (DB-less mode)
- Let's Encrypt TLS via DuckDNS
- OIDC authentication via Auth0

**Backend**
- Node.js + Express.js
- RabbitMQ (async messaging between services)

**Databases**
- MySQL (relational joke storage)
- MongoDB via Mongoose (document store — switchable at runtime)

**CI/CD**
- GitHub Actions
- Self-hosted runner on the Moderate VM
- Automated deployment on push to `main`

---

## Authentication

All write endpoints are protected via OIDC using Auth0. Kong validates JWTs at the gateway before forwarding requests — no individual service handles auth logic directly.

---

## Database Switching

The Joke Service supports both MySQL and MongoDB. The active database backend is controlled by an environment variable, allowing switching without code changes:

```env
DB_TYPE=mysql   # or mongodb
```

---

## Deployment

All infrastructure is provisioned with Terraform. Application updates are deployed via the GitHub Actions pipeline.

```bash
# Provision infrastructure
terraform init
terraform apply

# Application deploys automatically on push to main
# Manual deploy on a VM:
docker compose down && docker compose up --build -d
```

Internal VMs are only accessible via SSH through the Kong VM (bastion host pattern):

```bash
ssh -J user@<kong-public-ip> user@<internal-vm-private-ip>
```

---

## Environment Variables

Each service reads configuration from a `.env` file. Never commit `.env` files — see `.gitignore`.

Key variables:

```env
DB_TYPE=mysql
MYSQL_HOST=...
MONGO_URI=...
RABBITMQ_URL=...
AUTH0_DOMAIN=...
AUTH0_AUDIENCE=...
```

---

## Repository Structure

```
joke-platform/
├── kong/               # Kong declarative config (kong.yml)
├── joke-service/       # Joke retrieval service
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── src/
├── submit-service/     # Joke submission service
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── src/
├── moderate-service/   # Moderation service + GitHub Actions runner
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── src/
├── terraform/          # Azure infrastructure as code
│   ├── main.tf
│   ├── variables.tf
│   └── outputs.tf
└── .github/
    └── workflows/
        └── deploy.yml
```

---

## CI/CD Pipeline

GitHub Actions handles continuous deployment. On every push to `main`, the workflow SSHes into the relevant VM via the Kong bastion and runs:

```bash
docker compose down && docker compose up --build -d
```

The self-hosted runner lives on the Moderate VM and has pre-configured SSH keys for internal VM access.

---

## License

MIT
