# Bank Monitor API

API theo doi giao dich MBBank theo thoi gian thuc.

Project nay chi giu backend API, khong con giao dien web/static.

## Chuan bi

1. Tao file `.env` trong thu muc `bank_monitor_web` dua theo `.env.example`
2. Cai dependency:

```bash
pip install -r bank_monitor_web/requirements.txt
```

Dependency se tu cai `mbbank-lib` tu PyPI, khong can giu source repo `mbbank` de import.

## Chay

```bash
python -m bank_monitor_web.app
```

Endpoint chinh:

```text
GET /api/bank?stk=066668683
```

Trang `/` tra ve rong de service van bind port tren Render.

Neu thieu `stk`, API se tra `400`.

## Tach rieng du an nay

Neu muon mang app nay sang may khac, chi can copy thu muc `bank_monitor_web`, tao virtualenv moi, cai:

```bash
pip install -r requirements.txt
```

roi chay:

```bash
python -m bank_monitor_web.app
```
