import datetime
import os
import threading
from contextlib import asynccontextmanager
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import mbbank
import uvicorn


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def parse_decimal(value: str | None) -> Decimal:
    cleaned = (value or "0").replace(",", "").strip()
    if not cleaned:
        return Decimal("0")
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return Decimal("0")


def normalize_account_query(request: Request) -> str | None:
    raw_query = request.url.query.strip()
    if raw_query and "=" not in raw_query:
        return raw_query

    for key in ("account", "stk", "account_no"):
        value = request.query_params.get(key)
        if value:
            return value.strip()
    return None


class TransactionScanner:
    def __init__(self) -> None:
        username = os.getenv("MBBANK_USERNAME", "").strip()
        password = os.getenv("MBBANK_PASSWORD", "").strip()
        if not username or not password:
            raise RuntimeError("Missing MBBANK_USERNAME or MBBANK_PASSWORD in .env")

        self.refresh_seconds = max(5, int(os.getenv("MBBANK_REFRESH_SECONDS", "15")))
        self.lookback_days = max(1, int(os.getenv("MBBANK_LOOKBACK_DAYS", "2")))
        self.client = mbbank.MBBank(username=username, password=password)
        self.lock = threading.RLock()
        self.stop_event = threading.Event()
        self.thread: threading.Thread | None = None
        self.running = False
        self.last_refresh: str | None = None
        self.last_error: str | None = None
        self.accounts: list[dict[str, Any]] = []
        self.default_account: str | None = None
        self.transactions: dict[str, list[dict[str, Any]]] = {}

    def start(self) -> None:
        if self.thread and self.thread.is_alive():
            return
        self.refresh()
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()

    def stop(self) -> None:
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=5)

    def _loop(self) -> None:
        self.running = True
        while not self.stop_event.is_set():
            try:
                self.refresh()
            except Exception as exc:  # noqa: BLE001
                with self.lock:
                    self.last_error = str(exc)
                    self.last_refresh = datetime.datetime.now().isoformat(timespec="seconds")
            self.stop_event.wait(self.refresh_seconds)
        self.running = False

    def refresh(self) -> None:
        balance_info = self.client.getBalance()
        accounts = [
            {
                "acctNo": account.acctNo,
                "acctAlias": account.acctAlias,
                "acctNm": account.acctNm,
                "currentBalance": account.currentBalance,
            }
            for account in balance_info.acct_list
        ]
        default_account = accounts[0]["acctNo"] if accounts else None

        to_date = datetime.datetime.now()
        from_date = to_date - datetime.timedelta(days=self.lookback_days)

        refreshed_transactions: dict[str, list[dict[str, Any]]] = {}
        for account in accounts:
            account_no = account["acctNo"]
            history = self.client.getTransactionAccountHistory(
                accountNo=account_no,
                from_date=from_date,
                to_date=to_date,
            )
            items = [self._serialize_transaction(item) for item in history.transactionHistoryList]
            items.sort(
                key=lambda item: (
                    item.get("transactionDate") or "",
                    item.get("refNo") or "",
                ),
                reverse=True,
            )
            refreshed_transactions[account_no] = items

        with self.lock:
            self.accounts = accounts
            self.default_account = default_account
            self.transactions = refreshed_transactions
            self.last_error = None
            self.last_refresh = datetime.datetime.now().isoformat(timespec="seconds")

    def _serialize_transaction(self, transaction: Any) -> dict[str, Any]:
        credit = parse_decimal(transaction.creditAmount)
        debit = parse_decimal(transaction.debitAmount)
        direction = "in" if credit > 0 else "out"
        amount = credit if credit > 0 else debit
        return {
            "postingDate": transaction.postingDate,
            "transactionDate": transaction.transactionDate,
            "accountNo": transaction.accountNo,
            "creditAmount": transaction.creditAmount,
            "debitAmount": transaction.debitAmount,
            "currency": transaction.currency,
            "description": transaction.description,
            "addDescription": transaction.addDescription,
            "availableBalance": transaction.availableBalance,
            "beneficiaryAccount": transaction.beneficiaryAccount,
            "refNo": transaction.refNo,
            "benAccountName": transaction.benAccountName,
            "bankName": transaction.bankName,
            "benAccountNo": transaction.benAccountNo,
            "dueDate": transaction.dueDate,
            "docId": transaction.docId,
            "transactionType": transaction.transactionType,
            "pos": transaction.pos,
            "tracingType": transaction.tracingType,
            "direction": direction,
            "amount": str(amount),
        }

    def get_accounts(self) -> dict[str, Any]:
        with self.lock:
            return {
                "running": self.running,
                "last_refresh": self.last_refresh,
                "last_error": self.last_error,
                "default_account": self.default_account,
                "accounts": list(self.accounts),
            }

    def get_transactions(self, account_no: str | None) -> dict[str, Any]:
        with self.lock:
            target = account_no or self.default_account
            if not target:
                raise HTTPException(status_code=404, detail="No account available")

            if target not in self.transactions:
                raise HTTPException(
                    status_code=404,
                    detail=f"Account {target} is not available in scanner cache",
                )

            return {
                "scanner_running": self.running,
                "last_refresh": self.last_refresh,
                "last_error": self.last_error,
                "default_account": self.default_account,
                "account": target,
                "transactions": list(self.transactions[target]),
            }

scanner: TransactionScanner | None = None


def get_scanner() -> TransactionScanner:
    if scanner is None:
        raise HTTPException(status_code=503, detail="Scanner is not initialized")
    return scanner


@asynccontextmanager
async def lifespan(_: FastAPI):
    global scanner
    scanner = TransactionScanner()
    scanner.start()
    yield
    scanner.stop()


app = FastAPI(title="MBBank Transaction Monitor", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/accounts")
async def api_accounts():
    return get_scanner().get_accounts()


@app.get("/api/bank")
async def api_bank(request: Request):
    account_no = normalize_account_query(request)
    return get_scanner().get_transactions(account_no)


def main() -> None:
    host = os.getenv("MBBANK_HOST", "0.0.0.0")
    port = int(os.getenv("PORT", os.getenv("MBBANK_PORT", "8000")))
    uvicorn.run("bank_monitor_web.app:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    main()
