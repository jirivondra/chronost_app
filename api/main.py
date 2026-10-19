from fastapi import FastAPI, HTTPException, Depends, Request, Query, Response
from fastapi.security import HTTPBasic
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional
from datetime import date
import uvicorn
import secrets
import os
import json
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="TODO API", version="1.0.0", docs_url=None, openapi_url=None)
security = HTTPBasic()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"],
)

API_USERNAME = os.getenv("API_USERNAME")
API_PASSWORD = os.getenv("API_PASSWORD")

if not API_USERNAME or not API_PASSWORD:
    raise RuntimeError("API_USERNAME and API_PASSWORD must be set in .env")

DB_FILE = os.path.join(os.path.dirname(__file__), "todos.json")


def load_db() -> dict[int, dict]:
    if not os.path.exists(DB_FILE):
        return {}
    with open(DB_FILE, "r") as f:
        items = json.load(f)
    return {item["id"]: item for item in items}


def save_db(todos: dict[int, dict]):
    with open(DB_FILE, "w") as f:
        json.dump(list(todos.values()), f, indent=2)


def next_id(todos: dict[int, dict]) -> int:
    return max(todos.keys(), default=0) + 1


class TodoCreate(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "title": "Buy groceries",
                "description": "Milk, eggs, bread",
                "completed": False,
                "due_date": "2026-07-20",
            }
        }
    )

    title: str = Field(min_length=1)
    description: Optional[str] = Field(default=None, max_length=5000)
    completed: bool = False
    due_date: Optional[str] = None


class Todo(TodoCreate):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": 1,
                "title": "Buy groceries",
                "description": "Milk, eggs, bread",
                "completed": False,
                "due_date": "2026-07-20",
            }
        }
    )

    id: int


class TodoUpdate(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "title": "Buy groceries",
                "description": "Milk, eggs, bread",
                "completed": True,
                "due_date": "2026-07-20",
            }
        }
    )

    title: Optional[str] = Field(default=None, min_length=1)
    description: Optional[str] = Field(default=None, max_length=5000)
    completed: Optional[bool] = None
    due_date: Optional[str] = None


def authenticate(request: Request):
    auth_error = HTTPException(
        status_code=401,
        detail="Authentication required",
        headers={"WWW-Authenticate": "Basic"},
    )
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Basic "):
        raise auth_error
    import base64
    decoded = base64.b64decode(auth_header[6:]).decode("utf-8")
    username, _, password = decoded.partition(":")
    if not secrets.compare_digest(username, API_USERNAME) or not secrets.compare_digest(password, API_PASSWORD):
        raise auth_error


@app.get("/docs", include_in_schema=False)
def get_docs(_=Depends(authenticate)):
    return get_swagger_ui_html(openapi_url="/openapi.json", title="TODO API")


@app.get("/openapi.json", include_in_schema=False)
def get_openapi_schema(_=Depends(authenticate)):
    return get_openapi(title=app.title, version=app.version, routes=app.routes)


@app.get("/todos", response_model=list[Todo], summary="Get all TODOs")
def get_todos(
    response: Response,
    order: str = Query("desc", pattern="^(asc|desc)$", description="Sort order by id"),
    completed: Optional[bool] = Query(None, description="Filter by completed status"),
    page: int = Query(1, ge=1, description="1-indexed page number, used together with limit"),
    limit: Optional[int] = Query(
        None, ge=1, description="Items per page; omit to return every matching item"
    ),
    _=Depends(authenticate),
):
    items = sorted(load_db().values(), key=lambda t: t["id"], reverse=(order == "desc"))
    if completed is not None:
        items = [t for t in items if t["completed"] == completed]
    response.headers["X-Total-Count"] = str(len(items))
    if limit is not None:
        start = (page - 1) * limit
        items = items[start : start + limit]
    return items


@app.post("/todos", status_code=201, response_model=Todo, summary="Create a TODO")
def create_todo(todo: TodoCreate, _=Depends(authenticate)):
    todos = load_db()
    new_id = next_id(todos)
    item = {"id": new_id, **todo.model_dump()}
    todos[new_id] = item
    save_db(todos)
    return item


@app.get("/todos/overdue", response_model=list[Todo], summary="Get overdue TODOs")
def get_overdue_todos(_=Depends(authenticate)):
    today = date.today().isoformat()
    overdue = [
        t
        for t in load_db().values()
        if t.get("due_date") and not t["completed"] and t["due_date"] < today
    ]
    return sorted(overdue, key=lambda t: t["due_date"])


@app.get("/todos/{todo_id}", response_model=Todo, summary="Get a TODO by ID")
def get_todo(todo_id: int, _=Depends(authenticate)):
    todos = load_db()
    if todo_id not in todos:
        raise HTTPException(status_code=404, detail="TODO not found")
    return todos[todo_id]


@app.put("/todos/{todo_id}", response_model=Todo, summary="Update a TODO")
def update_todo(todo_id: int, todo: TodoUpdate, _=Depends(authenticate)):
    todos = load_db()
    if todo_id not in todos:
        raise HTTPException(status_code=404, detail="TODO not found")
    todos[todo_id].update(todo.model_dump(exclude_unset=True))
    save_db(todos)
    return todos[todo_id]


@app.delete("/todos/{todo_id}", status_code=204, summary="Delete a TODO")
def delete_todo(todo_id: int, _=Depends(authenticate)):
    todos = load_db()
    if todo_id not in todos:
        raise HTTPException(status_code=404, detail="TODO not found")
    del todos[todo_id]
    save_db(todos)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
