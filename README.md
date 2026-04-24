# Bank Monitor Web

Website theo doi giao dich MBBank theo thoi gian thuc.

Project nay co the chay doc lap, chi can thu muc `bank_monitor_web` va cac goi pip trong `requirements.txt`.

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

Trang web mac dinh:

```text
http://127.0.0.1:8000
```

API xem giao dich:

```text
/api/bank?123456789
```

Ho tro them cac dang query:

```text
/api/bank?account=123456789
/api/bank?stk=123456789
```

## Tach rieng du an nay

Neu muon mang app nay sang may khac, chi can copy thu muc `bank_monitor_web`, tao virtualenv moi, cai:

```bash
pip install -r requirements.txt
```

roi chay:

```bash
python -m bank_monitor_web.app
```
