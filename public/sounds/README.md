# Âm thanh của game

Mọi file âm thanh nằm chung trong thư mục này (`public/sounds/`), không có thư mục con, để dễ tái sử dụng. Định dạng: `.mp3`, `.ogg` hoặc `.wav`. File nào có thì game dùng file đó, file nào thiếu thì game tự tổng hợp âm thanh như cũ. Tiếng súng, tiếng nổ và tiếng xe được phát đè lên nhạc nền (nhạc tự nhỏ lại khi có tiếng).

## Tiếng súng (mỗi file chỉ chứa một phát bắn, game tự ghép thành loạt)

| File | Dùng cho |
|---|---|
| `rifle.mp3` | Súng trường của lính (loạt 3 viên) |
| `smg.mp3` | Tiểu liên (loạt 4 viên) |
| `mg.mp3` | Súng máy, bunker (loạt 5 viên) |
| `sniper.mp3` | Súng bắn tỉa |
| `autocannon.mp3` | Pháo tự động của xe bọc thép (loạt 3 viên) |
| `tank-cannon.mp3` | Pháo xe tăng (mỗi phát một tiếng) |
| `missile.mp3` | Tên lửa |

## Tiếng nổ

| File | Dùng cho |
|---|---|
| `explosion.mp3` | Xe / công trình nổ |
| `bomb.mp3` | Bom máy bay |

## Tiếng xe chạy (đoạn lặp liền mạch vài giây)

- Theo từng mẫu xe: `engine-` + tên hiển thị viết thường, dấu cách thành `-`: `engine-abrams.mp3`, `engine-t-90.mp3`, `engine-leopard-2.mp3`, `engine-type-99.mp3`, `engine-karrar.mp3`, `engine-f-22.mp3`, `engine-su-57.mp3`, `engine-b-52.mp3`…
- Hoặc dùng chung theo loại khi chưa có file riêng: `engine-tank.mp3`, `engine-ifv.mp3`, `engine-light.mp3`, `engine-truck.mp3`, `engine-repair.mp3`, `engine-jet.mp3`, `engine-bomber.mp3`, `engine-transport.mp3`, `engine-tanker.mp3`.

## Khác

| File | Dùng cho |
|---|---|
| `foot.mp3` | Tiếng bước chân |
| `board.mp3` | Lên / xuống xe vận tải |
