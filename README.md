# KitchenOS — Backend

REST API for **KitchenOS**, a multi-tenant SaaS for inventory and recipe management in gastronomy (restaurants, cafés, kitchens).

## Stack

- **Runtime** — Node.js 20 (ESM) + Express 5
- **Database** — PostgreSQL + node-pg-migrate
- **Cache / Rate limiting** — Redis (optional, toggled via `REDIS_ENABLE`)
- **Auth** — JWT (access + refresh tokens), bcrypt
- **Validation** — Zod
- **Logging** — Winston (with per-request `requestId`)
- **Tests** — Jest + Supertest (integration, against a real Postgres)
- **Infrastructure** — Docker + Docker Compose, GitHub Actions CI, Railway

## Architecture

```
Routes → Controllers → Services → Repositories → Database
```

| Layer | Responsibility |
|---|---|
| Routes | Wire HTTP endpoints to middleware (auth, role, validation) and controllers |
| Controllers | HTTP only — read the request, return the response |
| Services | Business logic, orchestration, transactions, ownership checks |
| Repositories | Parameterized SQL only |

Transactions are owned by services. Repositories accept an optional DB executor so they can take part in them.

### Multi-tenancy

Every organization's data is isolated:

- Every query is scoped by `organization_id` taken from the authenticated user (`req.user`), never from the request body, query or params.
- Accessing another organization's resource returns `404`, not `403`, so the API doesn't confirm that it exists.
- References between resources (e.g. a recipe's `productId`, a product's `categoryId`) are checked to belong to the caller's organization before any write.

### Errors

All errors go through a central error middleware and come back as JSON with a `requestId`:

- Validation errors → `400` with `errors: [{ field, message }]`
- Unknown routes → `404` (`"Route not found"`)
- Deleting a resource that is still referenced (e.g. a product used in a recipe or stock movement) → `409` with a readable message
- Raw database errors are never sent to the client

## Authentication

- **Register** creates an organization and its first admin user.
- **Login** checks email and password, issues an access + refresh token pair, stores the refresh token **hash** in the DB, sets the refresh token as an httpOnly cookie and returns the access token.
- **Refresh** verifies the token, matches its hash against the DB, revokes the old token and issues a new pair (rotation).
- **Logout** revokes the refresh token and clears the cookie.

Security notes:

- Refresh tokens are stored hashed, never raw
- Cookie: `httpOnly`, `sameSite: strict`, `secure` in production
- Reuse detection: presenting a revoked refresh token immediately revokes all of that user's tokens
- Role-based access: creating, updating and deleting products, categories and recipes, and updating the organization, require the `admin` role

## API endpoints

All routes are prefixed with `/api`. Everything except `health`, `register`, `login`, `refresh` and `logout` requires `Authorization: Bearer <accessToken>`.

**Health**

- `GET /api/health`

**Auth**

- `POST /api/auth/register` — creates organization + admin
- `POST /api/auth/login` — returns `accessToken`, sets `refreshToken` cookie
- `POST /api/auth/refresh` — rotates refresh token, issues a new access token
- `POST /api/auth/logout` — revokes refresh token
- `GET /api/auth/user` — current user

**Organizations**

- `GET /api/organizations/me`
- `PATCH /api/organizations/me`

**Categories**

- `GET /api/categories`
- `POST /api/categories`
- `PATCH /api/categories/:id`
- `DELETE /api/categories/:id`

**Products**

- `GET /api/products` — paginated (`?page=&limit=`)
- `GET /api/products/:id`
- `POST /api/products`
- `PUT /api/products/:id`
- `DELETE /api/products/:id`

**Stock movements**

- `POST /api/stock/movements` — `IN` / `OUT` movement, rejects `OUT` beyond available stock
- `GET /api/stock/movements/:productId/history`

**Recipes**

- `GET /api/recipes`
- `GET /api/recipes/:id`
- `POST /api/recipes`
- `PUT /api/recipes/:id`
- `DELETE /api/recipes/:id`

A recipe has a list of ingredients (`productId` + `quantity`, at least one). Each ingredient must reference an existing product in the caller's organization, and duplicates aren't allowed. On `PUT`, leaving out `ingredients` keeps the current ones, and sending a list replaces them.

`foodCost` and `foodCostPercentage` are calculated on every read from current product prices (never stored) and are returned on every response, including create and update. A product's `price` always means the price per that product's `unit`.

## Running locally

**Requirements:** Node.js ≥ 20, PostgreSQL, (optional) Redis — or just Docker.

**Install:**

```bash
npm ci
```

**Environment:**

```bash
cp .env.example .env.dev
# fill in DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
```

All variables are listed with comments in [`.env.example`](.env.example) and validated at startup (`src/config/env.js`), so the app won't start if a required one is missing.

**Migrations + start:**

```bash
npm run migrate:up:local
npm run dev
```

**Docker (recommended):**

```bash
npm run docker:dev        # API + Postgres + Redis
npm run docker:dev:down   # stop and remove volumes
```

## Testing

Integration tests run against a real PostgreSQL database, which is cleaned between tests. Coverage includes:

- **Auth** — registration, login, refresh rotation, current user, RBAC
- **Organizations** — get / update profile
- **Categories** — CRUD, validation
- **Products** — CRUD, pagination, validation, tenant isolation, delete-while-referenced (`409`)
- **Stock movements** — IN / OUT, insufficient stock, history
- **Recipes** — CRUD, food cost, tenant isolation, RBAC, validation (cross-tenant `productId`, duplicate and empty ingredients)
- **Health / DB** — health endpoint, database connectivity

```bash
npm test               # local (uses .env.test)
npm run docker:test    # fully containerized, same as CI
```

## Database migrations

```bash
npm run migrate:create -- <name>   # new migration in ./migrations
npm run migrate:up:local           # apply to the dev database
npm run migrate:down               # roll back the last migration (dev)
```

## CI / Deployment

- **CI** (GitHub Actions, `.github/workflows/ci.yml`) runs lint and the full containerized test suite on every pull request and every push to `main`.
- **Deployment**: `main` is production. Railway waits for green CI, runs `npm run migrate:up` as a pre-deploy step, then deploys.
- **Workflow**: no direct commits to `main`. Each task gets a short-lived branch (`feat/…`, `fix/…`, `chore/…`, `test/…`) and goes in through a pull request.
