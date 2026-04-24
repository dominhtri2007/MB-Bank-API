# Bank Monitor API

API theo doi giao dich MBBank theo thoi gian thuc.

Project nay chi giu backend API, khong con giao dien web/static.
Neu ban chi upload rieng noi dung thu muc nay len GitHub/Render thi chay truc tiep tu root project.

## Chuan bi

1. Tao file `.env` trong thu muc `bank_monitor_web` dua theo `.env.example`
2. Cai dependency:

```bash
pip install -r requirements.txt
```

Dependency se tu cai `mbbank-lib` tu PyPI, khong can giu source repo `mbbank` de import.

## Chay

```bash
uvicorn app:app --host 0.0.0.0 --port $PORT
```

Endpoint chinh:

```text
GET /api/bank?stk=066668683
```

Trang `/` tra ve rong de service van bind port tren Render.

Neu thieu `stk`, API se tra `400`.

## Tach rieng du an nay

Neu muon mang app nay sang may khac, chi can copy noi dung thu muc nay, tao virtualenv moi, cai:

```bash
pip install -r requirements.txt
```

roi chay:

```bash
uvicorn app:app --host 0.0.0.0 --port $PORT
```
