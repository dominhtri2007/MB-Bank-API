import datetime
import os
import threading
from contextlib import asynccontextmanager
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import PlainTextResponse
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
    value = request.query_params.get("stk")
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
        account_numbers = [account.acctNo for account in balance_info.acct_list]
        default_account = account_numbers[0] if account_numbers else None

        to_date = datetime.datetime.now()
        from_date = to_date - datetime.timedelta(days=self.lookback_days)

        refreshed_transactions: dict[str, list[dict[str, Any]]] = {}
        for account_no in account_numbers:
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

    def get_transactions(self, account_no: str | None) -> dict[str, Any]:
        with self.lock:
            target = account_no
            if not target:
                raise HTTPException(status_code=400, detail="Missing required query parameter: stk")

            if target not in self.transactions:
                raise HTTPException(
                    status_code=404,
                    detail=f"Account {target} is not available in scanner cache",
                )

            return {
                "scanner_running": self.running,
                "last_refresh": self.last_refresh,
                "last_error": self.last_error,
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


app = FastAPI(title="MBBank Transaction Monitor API", lifespan=lifespan)


@app.get("/", response_class=PlainTextResponse)
async def index():
    return ""


@app.get("/api/bank")
async def api_bank(request: Request):
    account_no = normalize_account_query(request)
    if not account_no:
        raise HTTPException(status_code=400, detail="Missing required query parameter: stk")
    return get_scanner().get_transactions(account_no)


def main() -> None:
    host = os.getenv("MBBANK_HOST", "0.0.0.0")
    port = int(os.getenv("PORT", os.getenv("MBBANK_PORT", "8000")))
    uvicorn.run("app:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    main()
