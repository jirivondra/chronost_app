import os
import sys

os.environ.setdefault("API_USERNAME", "ci")
os.environ.setdefault("API_PASSWORD", "ci")

from main import Todo, TodoCreate, TodoUpdate

errors = []
for model in (TodoCreate, TodoUpdate, Todo):
    example = model.model_config["json_schema_extra"]["example"]
    try:
        model.model_validate(example)
    except Exception as exc:
        errors.append(f"{model.__name__}.example is invalid: {exc}")

if errors:
    for error in errors:
        print(error, file=sys.stderr)
    sys.exit(1)

print("All model examples are valid.")
