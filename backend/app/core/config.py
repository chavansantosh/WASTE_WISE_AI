
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]

DATABASE_DIR = PROJECT_ROOT / "database"
DATABASE_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_URL = (
    f"sqlite:///{(DATABASE_DIR / 'waste_wise.db').as_posix()}"
)

APP_NAME = "WASTE WISE AI"
APP_VERSION = "1.0.0"
