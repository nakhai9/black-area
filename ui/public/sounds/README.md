# Âm thanh của game

Toàn bộ âm thanh trong thư mục này (`public/sounds/`) được tạo mới bằng `tools/sound_bank.py`. Script mô phỏng nguồn âm thật: tiếng nổ siêu thanh của đạn, luồng khí đầu nòng, cánh quạt, động cơ diesel theo số xy-lanh, xích xe, tua-bin... Tất cả là WAV 16-bit mono 22050 Hz.

Tạo lại (chạy trong `ui/`):

```
python tools/sound_bank.py
```

Script ghi đè các file `.wav` và cập nhật danh sách `src/audio/soundBank.generated.ts`. Game chỉ tải những file có trong danh sách đó. Muốn chỉnh tiếng thì sửa thông số trong script (bảng `GUNS`, `CANNONS`, `GROUND`, `HELIS`, `AIR`, `SHIPS`, `FEET`) rồi chạy lại.

Muốn thay một tiếng bằng bản ghi âm thật: đặt file cùng tên vào thư mục này (ví dụ `rifle-russia.wav`) và giữ tên đó trong danh sách.

## Súng bộ binh theo phe

`<loại>-<phe>.wav`, với `<loại>` là `rifle`, `smg`, `mg`, `sniper`:

| Phe | Súng mô phỏng |
|---|---|
| `usa` | M16 / M4 (5.56 mm) |
| `russia` | AK-74 (5.45 mm) |
| `china` | QBZ-95 (5.8 mm) |
| `europe` | HK416 / FAMAS (5.56 mm) |
| `islamic` | AKM (7.62x39 mm), tiếng vọng sa mạc |

Mỗi file có nhiều loạt bắn. Mỗi lần bắn, game cắt một đoạn ngắn bắt đầu từ một phát (`SAMPLE_CLIP`).

## Pháo và tiếng nổ

| File | Dùng cho |
|---|---|
| `tank-cannon-<phe>.wav` | Pháo xe tăng: 120 mm (Mỹ, châu Âu), 125 mm (Nga, Trung Quốc, Hồi giáo) |
| `howitzer.wav` | Pháo tự hành K9 |
| `grad.wav` | Phóng loạt BM-21 |
| `missile.wav` | Tên lửa |
| `airgun.wav` | Pháo 30 mm của máy bay / trực thăng |
| `autocannon.wav` | Pháo tự động của xe bọc thép |
| `bomb.wav`, `explosion.wav` | Bom, xe / công trình nổ |

## Động cơ (đoạn lặp liền mạch)

`engine-<tên mẫu>.wav`: tên hiển thị viết thường, dấu cách thành `-` (ví dụ `engine-t-90.wav`, `engine-ah-64-apache.wav`, `engine-c-17.wav`). Có cho mọi xe, trực thăng, máy bay và tàu sân bay. Mẫu nào chưa có file riêng thì dùng file chung theo loại: `engine-tank.wav`, `engine-ifv.wav`, `engine-light.wav`, `engine-truck.wav`, `engine-repair.wav`.

## Lính và môi trường

| File | Dùng cho |
|---|---|
| `foot-<loại lính>.wav` | Bước chân: `regular`, `special`, `engineer`, `squatters`, `demolition` |
| `board.wav` | Lên / xuống xe vận tải |
| `sea-waves.wav` | Sóng biển khi camera ở ngoài khơi |
