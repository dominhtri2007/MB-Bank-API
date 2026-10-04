# MBBank Payment Gateway API

REST API tự host để xem số dư, lịch sử giao dịch MB Bank, tạo VietQR và kiểm tra giao dịch nhận tiền. Dự án dùng thư viện `mbbank` không chính thức; chỉ dùng với tài khoản của bạn và tự chịu trách nhiệm khi MB Bank thay đổi hệ thống.

## Chức năng

- Đăng nhập MB Bank và giữ phiên tự động.
- Xem số dư và lịch sử giao dịch.
- Tạo URL ảnh VietQR theo số tiền và mã thanh toán.
- Kiểm tra giao dịch tiền vào theo nội dung chuyển khoản và số tiền.
- Bảo vệ API bằng API key, giới hạn tốc độ và whitelist IP tùy chọn.

> Phiên bản hiện tại **không có** cơ sở dữ liệu, webhook, quản lý trạng thái đơn hàng hoặc đối soát tự động.

> **Tích hợp POS Local API:** Chọn **Local API (MBBank tự host)** trong cài đặt thanh toán POS, nhập URL gốc đã deploy (ví dụ `https://mb-api.example.com`) và giá trị `API_KEY`. POS sẽ polling `/api/check-transaction` mỗi 4 giây theo đúng nội dung QR và số tiền; khi nhận `found: true`, POS tự hoàn tất bill và dọn bàn, không cần webhook. Dùng Render Web Service chạy liên tục để duy trì phiên MB; Vercel serverless không phù hợp để duy trì phiên/nghiệm vụ polling lâu dài.


## Yêu cầu

- Node.js 18+ (khuyến nghị Node.js 20 LTS)
- npm
- Tài khoản MB Bank Internet Banking hợp lệ

## Cài đặt và chạy

Trong Windows PowerShell:

```powershell
cd D:\mb-api
Copy-Item .env.example .env
notepad .env
npm install
npm start
```

Phát triển với tự khởi động lại:

```powershell
npm run dev
```

Hoặc nhấp đúp `D:\mb-api\run.bat` sau khi đã cài dependencies và cấu hình `.env`.

Server mặc định chạy tại `http://localhost:3456`. Kiểm tra nhanh:

```powershell
curl http://localhost:3456/api/health
```

Nếu có `MB_USERNAME` và `MB_PASSWORD`, server sẽ đăng nhập MB Bank khi khởi động. Khi đăng nhập lỗi, server vẫn online nhưng các API lấy dữ liệu MB Bank sẽ lỗi cho đến khi cấu hình hợp lệ.

## Cấu hình `.env`

Sao chép `.env.example`; không commit hay chia sẻ `.env`.

| Biến | Bắt buộc | Mô tả | Mặc định |
|---|---|---|---|
| `PORT` | Không | Cổng HTTP | `3456` |
| `API_KEY` | Có | Khoá bảo vệ API | — |
| `MB_USERNAME` | Có* | Tên đăng nhập MB Bank | — |
| `MB_PASSWORD` | Có* | Mật khẩu MB Bank | — |
| `MB_ACCOUNT_NUMBER` | Có cho lịch sử/QR | Số tài khoản nhận tiền | — |
| `MB_BIN` | Không | BIN VietQR của MB Bank | `970422` |
| `RATE_LIMIT_MAX` | Không | Request tối đa trong một cửa sổ | `60` |
| `RATE_LIMIT_WINDOW_MS` | Không | Cửa sổ rate limit (ms) | `60000` |
| `ALLOWED_IPS` | Không | Các IP, ngăn cách bởi dấu phẩy | rỗng |
| `KEEP_ALIVE_INTERVAL` | Không | Chu kỳ giữ phiên (ms) | `240000` |
| `MAX_PING_FAILURES` | Không | Số ping lỗi trước khi đăng nhập lại | `3` |
| `LOG_LEVEL` | Không | `debug`, `info`, `warn`, `error` | `info` |

`*` Cần cho số dư, lịch sử và kiểm tra giao dịch. Tạo QR chỉ cần `MB_ACCOUNT_NUMBER`.

## Xác thực

`GET /api/health` không cần API key. Mọi API khác cần `API_KEY`, theo thứ tự ưu tiên:

1. Đường dẫn: `/api/.../:apiKey`
2. Header: `X-Api-Key: <API_KEY>`
3. Header: `Authorization: Bearer <API_KEY>`
4. Query: `?apiKey=<API_KEY>`

Khuyến nghị dùng header để tránh ghi secret vào log/URL. Ví dụ:

```powershell
$base = 'http://localhost:3456'
$key = 'gia-tri-API_KEY-trong-env'
$headers = @{ 'X-Api-Key' = $key }
```

## API

### Health check

`GET /api/health` — không xác thực.

```powershell
curl "$base/api/health"
```

```json
{"status":"ok","bank_connected":true,"last_login":"2026-10-02T08:00:00.000Z","account":"***1234"}
```

### Lịch sử giao dịch

`GET /api/history`

| Query | Mô tả |
|---|---|
| `from`, `to` | Ngày `DD/MM/YYYY`; mặc định là hôm nay |
| `limit` | 1–500; mặc định 100 |
| `type` | `IN`/`CREDIT` (tiền vào), `OUT`/`DEBIT` (tiền ra) |

```powershell
curl "$base/api/history?from=01/10/2026&to=02/10/2026&type=IN&limit=20" -Headers $headers
```

Phản hồi: `{"success":true,"count":1,"data":[...]}`. Mỗi giao dịch gồm `refNo`, `transactionDate`, `creditAmount`, `debitAmount`, `type`, `currency`, `description`, `balanceAvailable`, `accountNumber`.

### Kiểm tra giao dịch nhận tiền

`GET`/`POST /api/check-transaction`; bí danh: `/api/check`. Gửi bằng query hoặc JSON body (body được ưu tiên).

| Tham số | Bắt buộc | Mô tả |
|---|---|---|
| `code` hoặc `memo` | Có | Mã trong nội dung giao dịch hoặc mã tham chiếu |
| `amount` | Không | Số tiền VND phải khớp chính xác |
| `days` | Không | Số ngày tra cứu, 1–30; mặc định 7 |
| `from`, `to` | Không | Khoảng ngày `DD/MM/YYYY`, thay thế `days` nếu hợp lệ |

```powershell
curl "$base/api/check-transaction?code=DH1234&amount=150000" -Headers $headers
```

Tìm thấy: `{"success":true,"found":true,"transaction":{...},"query":{"code":"DH1234","amount":150000}}`.

Chưa có: `{"success":true,"found":false,"message":"Chưa có giao dịch","checkedCount":0}`.

### Tạo VietQR

`GET`/`POST /api/create-payment`

| Tham số | Bắt buộc | Mô tả |
|---|---|---|
| `amount` | Có | Số tiền dương (VND) |
| `code` hoặc `memo` | Không | Nội dung chuyển khoản; tự sinh `MBxxxxxx` nếu bỏ trống |

```powershell
curl -Method Post "$base/api/create-payment" -Headers $headers -ContentType 'application/json' -Body '{"amount":150000,"code":"DH1234"}'
```

```json
{"success":true,"data":{"bank":"MB","bin":"970422","accountNumber":"0123456789","amount":150000,"code":"DH1234","qrUrl":"https://img.vietqr.io/image/...","checkUrl":"/api/check-transaction?code=DH1234&amount=150000"}}
```

### Số dư

`GET /api/balance`

```powershell
curl "$base/api/balance" -Headers $headers
```

Phản hồi: `{"success":true,"data":{...}}`. `data` là phản hồi gốc từ thư viện MB Bank nên có thể thay đổi.

## Mã lỗi

| HTTP | Ý nghĩa |
|---|---|
| `400` | Thiếu/sai tham số |
| `401` | Thiếu hoặc sai API key |
| `403` | IP không thuộc `ALLOWED_IPS` |
| `429` | Vượt rate limit |
| `500` | Thiếu cấu hình, lỗi đăng nhập hoặc lỗi MB Bank |

## Docker

```powershell
docker build -t mbbank-gateway D:\mb-api
docker run --rm -p 3456:3456 --env-file D:\mb-api\.env mbbank-gateway
```

## Cấu trúc

```text
D:\mb-api
├── src\server.js              # Express và endpoint
├── src\routes\api.js          # Handler API
├── src\services\bank-connector.js
├── src\services\session-keeper.js
├── src\utils\security.js
├── scripts\patch-mbbank.js    # Patch dependency mbbank
├── .env.example
├── Dockerfile
└── package.json
```

## Bảo mật

- Dùng API key dài, ngẫu nhiên; thay giá trị mẫu ngay.
- Chỉ public qua HTTPS/reverse proxy và cấu hình `ALLOWED_IPS`.
- Không chia sẻ `.env`, log hay URL chứa API key.
- Tích hợp này không chính thức; MB Bank có thể thay đổi API/điều khoản bất cứ lúc nào.
