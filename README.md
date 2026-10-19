# TODO App

**API coverage:** [![codecov](https://codecov.io/gh/jirivondra/Chronost_App/branch/main/graph/badge.svg?flag=api)](https://codecov.io/gh/jirivondra/Chronost_App)

A full-stack TODO application with a FastAPI backend and a static HTML/CSS frontend.

> **Note:** This is a personal learning project, not a production app. The stack deliberately mixes technologies (REST, SOAP, multiple test frameworks, a Postman sync pipeline, etc.) that a real TODO app wouldn't need together — they're here so I could practice with each one, not because this combination is the "right" architecture for the job.

## Stack

| Layer        | Technology                                                               |
| ------------ | ------------------------------------------------------------------------ |
| API          | Python, FastAPI                                                          |
| SOAP         | Python, spyne (SOAP 1.1)                                                 |
| Frontend     | HTML, Tailwind CSS                                                       |
| Postman sync | Node.js, `openapi-to-postmanv2`, `newman` (see `postman-sync/README.md`) |

## Project structure

```
├── api/
│   ├── main.py               # FastAPI TODO API (REST)
│   ├── soap_calculator.py    # SOAP Calculator service
│   └── requirements.txt
└── frontend/
    ├── login.html            # Login screen
    ├── dashboard.html        # Main task dashboard (includes calculator widget)
    ├── edit-task.html        # Edit task screen
    ├── task-detail.html      # Task detail screen (read-only)
    └── calculator.html       # Full SOAP calculator page
```

## Setup

### 1. Install Python dependencies

```bash
pip install -r api/requirements.txt
# or if pip doesn't work
pip3 install -r api/requirements.txt
```

### 2. Configure environment

Create a `.env` file in the `api/` directory:

```bash
cp api/.env.example api/.env
```

Open `api/.env` and set the credentials:

```
API_USERNAME=your-username
API_PASSWORD=your-password
```

The `.env` file is gitignored and never committed.

### 3. Install Task

The project uses [Task](https://taskfile.dev) as a task runner. Installation:

```bash
# macOS
brew install go-task

# Windows
winget install Task.Task

# Linux
sh -c "$(curl --location https://taskfile.dev/install.sh)" -- -d -b /usr/local/bin
```

## Running the project

### 1. Start the API + SOAP service

```bash
task be-up
```

The REST API runs on `http://localhost:8000`, the SOAP Calculator on `http://localhost:8001`.

### 2. Start the frontend

```bash
task fe-up
```

The frontend runs on `http://localhost:3000`. Available screens:

```
http://localhost:3000/login.html        ← login screen
http://localhost:3000/dashboard.html    ← task dashboard (+ calculator widget)
http://localhost:3000/edit-task.html    ← edit task
http://localhost:3000/task-detail.html  ← task detail (read-only)
http://localhost:3000/calculator.html   ← SOAP calculator
```

### Stopping the API

```bash
task be-down
```

## Taskfile commands

| Command          | Description                                  |
| ---------------- | -------------------------------------------- |
| `task be-up`     | Starts the FastAPI backend + SOAP Calculator |
| `task be-down`   | Stops the FastAPI backend + SOAP Calculator  |
| `task soap-up`   | Starts only the SOAP Calculator (port 8001)  |
| `task soap-down` | Stops the SOAP Calculator                    |
| `task fe-up`     | Starts the frontend server                   |
| `task fe-down`   | Stops the frontend server                    |
| `task restart`   | Restarts the API (clean + be-up)             |
| `task clean`     | Deletes Python cache files                   |

## SOAP Calculator service

The project includes a SOAP 1.1 calculator service built on the [spyne](https://spyne.io) library. It serves as a demo and testing ground for the SOAP protocol.

**Available operations:** `Add`, `Subtract`, `Multiply`, `Divide` (input and output: `Double`)

| URL                           | Description     |
| ----------------------------- | --------------- |
| `http://localhost:8001`       | SOAP endpoint   |
| `http://localhost:8001/?wsdl` | WSDL definition |

### Testing in SoapUI

1. Open SoapUI → **New SOAP Project**
2. WSDL: `http://localhost:8001/?wsdl`
3. Select an operation and send the request

### Testing in Postman

1. New request → **POST** `http://localhost:8001`
2. Header: `Content-Type: text/xml`
3. Body (raw XML):

```xml
<?xml version="1.0" encoding="utf-8"?>
<soap-env:Envelope xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/">
  <soap-env:Body>
    <tns:Add xmlns:tns="chronos.calculator">
      <tns:a>10</tns:a>
      <tns:b>5</tns:b>
    </tns:Add>
  </soap-env:Body>
</soap-env:Envelope>
```

The calculator is also available as a widget on the dashboard and as a full page at `http://localhost:3000/calculator.html`.

## API documentation

Swagger UI is available at `http://localhost:8000/docs` once the API is running. It is protected by the same Basic Auth as the other endpoints.

## Authentication

The API uses HTTP Basic Auth. Credentials are set in `api/.env`.

### Usage example

In Postman: **Authorization** tab → Type: **Basic Auth** → enter the username + password from `.env`.

Or curl:

```bash
curl http://localhost:8000/todos --user 'your-username:your-password'
```

## API endpoints

All endpoints require authentication.

| Method | Endpoint     | Description                                                                                                                                                    |
| ------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/todos`     | List tasks — optional `order` (`asc`/`desc`), `completed` (bool), `page`, `limit` query params; filtered total count is returned in the `X-Total-Count` header |
| POST   | `/todos`     | Create a task                                                                                                                                                  |
| GET    | `/todos/:id` | Task detail                                                                                                                                                    |
| PUT    | `/todos/:id` | Update a task                                                                                                                                                  |
| DELETE | `/todos/:id` | Delete a task                                                                                                                                                  |

## Testing

| Type      | Tool       | Repository                                                                             |
| --------- | ---------- | -------------------------------------------------------------------------------------- |
| API tests | Mocha      | [mocha_rest_soap_testing](https://github.com/jirivondra/mocha_rest_soap_testing)       |
| E2E tests | Playwright | [Chronos_Playwright_testing](https://github.com/jirivondra/Chronos_Playwright_testing) |
| Manual    | Postman    | [chronos_postman_colection](https://github.com/jirivondra/chronos_postman_colection)   |

Code coverage for the API is measured with [Codecov](https://app.codecov.io/github/jirivondra/chronost_app), collected by the `API Coverage` workflow (`.github/workflows/coverage.yml`) and configured via `codecov.yml`.
