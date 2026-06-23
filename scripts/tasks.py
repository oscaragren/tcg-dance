"""
Task tracker interface for a Google Sheets kanban board.

Setup:
    pip install gspread google-auth

Expected sheet columns (row 1 = headers, exact names):
    ID | Title | Status | Type | Priority | Assignee | Notes | Created | Updated

Usage (CLI):
    python tasks.py list
    python tasks.py list --status "In Progress"
    python tasks.py list --assignee Claude
    python tasks.py add "Fix jump hitbox" --type Bug --priority P1 --assignee Claude
    python tasks.py update ID004 --status Done
    python tasks.py update ID004 --notes "Fixed in commit abc123"

Usage (as a library, e.g. from another script Claude Code writes):
    from tasks import TaskSheet
    sheet = TaskSheet()
    sheet.list_tasks(status="To Do")
    sheet.update_task("ID004", status="Done")
"""

import argparse
import datetime
import os
import sys

import gspread
from google.oauth2.service_account import Credentials

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
]

# --- Configure these two for your project ---
SERVICE_ACCOUNT_FILE = os.environ.get(
    "GSHEETS_CREDS", "secrets/service_account.json"
)
SPREADSHEET_NAME_OR_KEY = os.environ.get("GSHEETS_SHEET", "Game Task Tracker")
WORKSHEET_NAME = os.environ.get("GSHEETS_WORKSHEET", "Tasks")
# ---------------------------------------------

REQUIRED_HEADERS = [
    "ID", "Title", "Status", "Type", "Priority",
    "Assignee", "Notes", "Created", "Updated",
]


class TaskSheet:
    def __init__(self, creds_file=None, sheet_name=None, worksheet_name=None):
        creds_file = creds_file or SERVICE_ACCOUNT_FILE
        sheet_name = sheet_name or SPREADSHEET_NAME_OR_KEY
        worksheet_name = worksheet_name or WORKSHEET_NAME

        if not os.path.exists(creds_file):
            raise FileNotFoundError(
                f"Service account JSON not found at '{creds_file}'. "
                f"Set GSHEETS_CREDS env var or place the file there."
            )

        creds = Credentials.from_service_account_file(creds_file, scopes=SCOPES)
        client = gspread.authorize(creds)

        # Accept either a sheet name or a sheet key/URL
        if sheet_name.startswith("http") or "/" in sheet_name:
            self.spreadsheet = client.open_by_url(sheet_name)
        else:
            try:
                self.spreadsheet = client.open(sheet_name)
            except gspread.SpreadsheetNotFound:
                self.spreadsheet = client.open_by_key(sheet_name)

        self.worksheet = self.spreadsheet.worksheet(worksheet_name)
        self._validate_headers()

    def _validate_headers(self):
        headers = self.worksheet.row_values(1)
        missing = [h for h in REQUIRED_HEADERS if h not in headers]
        if missing:
            raise ValueError(
                f"Sheet is missing expected columns: {missing}. "
                f"Found: {headers}"
            )
        self._headers = headers

    def _col(self, name):
        return self._headers.index(name) + 1  # gspread is 1-indexed

    def _all_records(self):
        return self.worksheet.get_all_records()

    def list_tasks(self, status=None, assignee=None, type_=None, priority=None):
        records = self._all_records()
        if status:
            records = [r for r in records if r.get("Status", "").lower() == status.lower()]
        if assignee:
            records = [r for r in records if r.get("Assignee", "").lower() == assignee.lower()]
        if type_:
            records = [r for r in records if r.get("Type", "").lower() == type_.lower()]
        if priority:
            records = [r for r in records if r.get("Priority", "").lower() == priority.lower()]
        return records

    def get_task(self, task_id):
        for idx, record in enumerate(self._all_records(), start=2):  # row 2 onward
            if record.get("ID") == task_id:
                return record, idx
        return None, None

    def add_task(self, title, status="Backlog", type_="Feature", priority="P2",
                 assignee="", notes=""):
        records = self._all_records()
        existing_ids = [r["ID"] for r in records if r.get("ID", "").startswith("ID")]
        nums = [int(i[2:]) for i in existing_ids if i[2:].isdigit()]
        next_num = max(nums, default=0) + 1
        new_id = f"ID{next_num:03d}"

        today = datetime.date.today().isoformat()
        row = [""] * len(self._headers)
        row[self._col("ID") - 1] = new_id
        row[self._col("Title") - 1] = title
        row[self._col("Status") - 1] = status
        row[self._col("Type") - 1] = type_
        row[self._col("Priority") - 1] = priority
        row[self._col("Assignee") - 1] = assignee
        row[self._col("Notes") - 1] = notes
        row[self._col("Created") - 1] = today
        row[self._col("Updated") - 1] = today

        self.worksheet.append_row(row)
        return new_id

    def update_task(self, task_id, **fields):
        """
        Update any combination of: status, type_, priority, assignee, notes, title
        e.g. sheet.update_task("ID004", status="Done", notes="Fixed in abc123")
        """
        _, row_idx = self.get_task(task_id)
        if row_idx is None:
            raise ValueError(f"Task {task_id} not found")

        field_map = {
            "title": "Title",
            "status": "Status",
            "type_": "Type",
            "priority": "Priority",
            "assignee": "Assignee",
            "notes": "Notes",
        }

        updates = []
        for key, value in fields.items():
            if value is None:
                continue
            col_name = field_map.get(key)
            if not col_name:
                continue
            updates.append((row_idx, self._col(col_name), value))

        if updates:
            updates.append((row_idx, self._col("Updated"), datetime.date.today().isoformat()))

        for row, col, value in updates:
            self.worksheet.update_cell(row, col, value)

        return True


def _print_tasks(tasks):
    if not tasks:
        print("No matching tasks.")
        return
    for t in tasks:
        print(f"[{t.get('ID')}] {t.get('Status'):<12} {t.get('Priority'):<4} "
              f"{t.get('Type'):<8} {t.get('Title')} (-> {t.get('Assignee') or 'unassigned'})")


def main():
    parser = argparse.ArgumentParser(description="Manage game dev tasks in Google Sheets")
    sub = parser.add_subparsers(dest="command", required=True)

    p_list = sub.add_parser("list")
    p_list.add_argument("--status")
    p_list.add_argument("--assignee")
    p_list.add_argument("--type", dest="type_")
    p_list.add_argument("--priority")

    p_add = sub.add_parser("add")
    p_add.add_argument("title")
    p_add.add_argument("--status", default="Backlog")
    p_add.add_argument("--type", dest="type_", default="Feature")
    p_add.add_argument("--priority", default="P2")
    p_add.add_argument("--assignee", default="")
    p_add.add_argument("--notes", default="")

    p_update = sub.add_parser("update")
    p_update.add_argument("id")
    p_update.add_argument("--status")
    p_update.add_argument("--type", dest="type_")
    p_update.add_argument("--priority")
    p_update.add_argument("--assignee")
    p_update.add_argument("--notes")
    p_update.add_argument("--title")

    args = parser.parse_args()
    sheet = TaskSheet()

    if args.command == "list":
        tasks = sheet.list_tasks(
            status=args.status, assignee=args.assignee,
            type_=args.type_, priority=args.priority,
        )
        _print_tasks(tasks)

    elif args.command == "add":
        new_id = sheet.add_task(
            args.title, status=args.status, type_=args.type_,
            priority=args.priority, assignee=args.assignee, notes=args.notes,
        )
        print(f"Added {new_id}: {args.title}")

    elif args.command == "update":
        sheet.update_task(
            args.id, status=args.status, type_=args.type_,
            priority=args.priority, assignee=args.assignee,
            notes=args.notes, title=args.title,
        )
        print(f"Updated {args.id}")


if __name__ == "__main__":
    main()