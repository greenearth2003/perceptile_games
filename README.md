# Nhãn Lực 👁️

5 bài test cảm quan siêu nhỏ trên trình duyệt — 2 phút, 1 điểm số. Chơi một mình, đấu 2 người cùng đề, hoặc mở **phòng online cho 2–4 máy** thi đấu cùng lúc.

Không cần cài đặt thư viện nào: frontend là HTML/CSS/JS thuần, server chỉ dùng thư viện chuẩn Python.

## 5 thử thách

| | Thử thách | Cách chơi | Sai số dùng để chấm |
|---|---|---|---|
| 🔢 | Đếm chấm | Chấm hiện 2 giây, nhập số chấm đã thấy | Tỉ lệ log giữa số đoán và số thật |
| 🎯 | Điểm rơi | Bóng bay rồi biến mất, bấm vào chỗ bóng sẽ chạm đất | Khoảng cách (px) |
| 📐 | Góc | Kéo kim tới đúng góc yêu cầu (ngược chiều kim đồng hồ) | Độ lệch góc (°) |
| 🥁 | Giữ nhịp | Gõ theo 8 tiếng nhịp; khi nhịp tắt, gõ đều thêm 8 lần | Độ trôi nhịp + độ dao động (ms) |
| ✂️ | Chia đoạn | Đánh dấu một tỉ lệ (phân số hoặc %) trên đoạn thẳng | Độ lệch so với chiều dài đoạn (%) |

Điểm mỗi bài: `100 × e^(−½·(sai số/σ)²)`, làm tròn 0–100. Điểm tổng là trung bình 5 bài.

## Chế độ chơi

- **Đề hôm nay** — mỗi ngày một đề, giống nhau với mọi người. Kết quả lưu trong trình duyệt.
- **Luyện tập** — đề ngẫu nhiên, xem đáp án sau từng bài.
- **⚔️ Đấu 2 người** (không cần server)
  - *Cùng một máy*: chơi lần lượt, kết quả người 1 được giấu đến khi người 2 chơi xong.
  - *Gửi link*: chơi xong, gửi link thách đấu; đối thủ chơi đúng đề đó rồi gửi lại link kết quả.
- **🌐 Phòng online (2–4 máy)** (cần chạy `server.py`)
  - Một người tạo phòng và trở thành **trưởng phòng**; người khác vào bằng ID phòng 5 ký tự hoặc link.
  - Cài đặt (mã đề, đồng hồ) tự đồng bộ tới mọi máy; **chỉ trưởng phòng được chỉnh** (server kiểm tra quyền).
  - Cả phòng đếm ngược và bắt đầu cùng lúc, cùng đề; đáp án người khác được giấu đến khi tất cả xong.
  - Trưởng phòng có thể mời người ra, kết thúc trận ngay, mở ván mới. Trưởng phòng rời đi thì quyền chuyển cho người kế tiếp.
  - Reload giữa trận vẫn chơi tiếp đúng bài đang dở.

Mọi chế độ đấu đều cho kết quả công bằng: **cùng mã đề → cùng số chấm, cùng quỹ đạo, cùng góc, cùng nhịp, cùng đoạn thẳng** (sinh từ seed cố định). Bảng kết quả xếp hạng theo tổng điểm → số bài thắng → thời gian, kèm biểu đồ radar và hình vẽ đáp án đúng cạnh câu trả lời của từng người.

### Đồng hồ đếm ngược

Khi đấu, có thể chọn:

- **Không giới hạn** — vẫn ghi lại thời gian để phân định khi hoà điểm.
- **Cả lượt** — một đồng hồ cho cả 5 bài (chọn nhanh 45/60/90/120/180 giây).
- **Mỗi thử thách** — đếm ngược riêng từng bài (chọn nhanh 10/15/20/30 giây).

Có thể tự nhập 5–3600 giây. Hết giờ thì lượt tự dừng: bài đang làm dở được chấm theo thao tác hiện tại (số đã gõ, kim đang giữ, vạch đang kéo, hoặc nhịp nếu đã gõ từ 3 lần), bài chưa làm được 0 điểm.

## Cách chạy

### Chơi một mình / đấu 2 người

Mở trực tiếp `index.html` bằng trình duyệt là chơi được.

### Phòng online (2–4 máy)

```bash
python3 server.py                          # cổng 8000, mở cho cả mạng LAN
python3 server.py --port 9000              # đổi cổng
python3 server.py --host 127.0.0.1         # chỉ máy này
```

Server in ra 2 địa chỉ:

- `http://localhost:8000` — mở trên máy chạy server.
- `http://<IP-LAN>:8000` — máy khác cùng mạng WiFi/LAN mở địa chỉ này.

> ⚠️ Phải dùng `server.py`. Nếu mở game bằng `python3 -m http.server`, phòng online sẽ không tạo được (server tĩnh từ chối các yêu cầu POST với lỗi 501).

## Xử lý sự cố

**Máy khác không vào được, hoặc kết nối phòng rất lâu (macOS)**
Firewall macOS có thể đang chặn bản Python bạn dùng nhận kết nối từ mạng. Kiểm tra:

```bash
/usr/libexec/ApplicationFirewall/socketfilterfw --getappblocked "$(python3 -c 'import os,sys;print(os.path.realpath(sys.executable))')"
```

Cách xử lý (chọn một):

- Chạy server bằng Python có sẵn của macOS (được Apple ký nên firewall tự cho qua): `/usr/bin/python3 server.py`
- Hoặc bỏ chặn bản Python đang dùng: `sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp <đường-dẫn-python>`
- Hoặc vào System Settings → Network → Firewall → Options và cho phép Python.

**Thử nhiều người chơi trên cùng một máy**
Chrome chỉ giữ tối đa 6 kết nối cùng lúc tới một địa chỉ. Đừng mở quá 4–5 tab phòng trên cùng một trình duyệt — dùng các trình duyệt hoặc máy khác nhau.

## Cấu trúc thư mục

```
index.html   Khung trang
style.css    Giao diện (tự đổi sáng/tối theo hệ điều hành)
game.js      Toàn bộ logic game: 5 thử thách, chấm điểm, đấu 2 người, đồng hồ, client phòng online
server.py    Server tĩnh + API phòng online (Server-Sent Events), chỉ dùng thư viện chuẩn Python 3.9+
```

### API phòng online (tóm tắt)

| Phương thức | Đường dẫn | Mô tả |
|---|---|---|
| `POST` | `/api/rooms` | Tạo phòng `{name}` → `{roomId, playerId, token}` |
| `POST` | `/api/rooms/<ID>/join` | Vào phòng `{name, token?}` (có token = vào lại) |
| `GET` | `/api/rooms/<ID>/events?token=` | Luồng SSE trạng thái phòng |
| `POST` | `/api/rooms/<ID>/config` | 👑 Đổi cài đặt `{token, config:{code, timer}}` |
| `POST` | `/api/rooms/<ID>/start` · `force` · `reset` · `kick` | 👑 Bắt đầu / kết thúc ngay / ván mới / mời ra |
| `POST` | `/api/rooms/<ID>/answer` · `finish` · `leave` | Nộp từng bài / nộp xong / rời phòng |
| `GET` | `/api/ping` | Kiểm tra server phòng online |

👑 = chỉ trưởng phòng.

## Giới hạn

- Dữ liệu phòng chỉ nằm trong RAM — tắt server là mất. Phòng bỏ trống quá 3 giờ tự bị xoá.
- Server không có HTTPS. Dùng trong mạng LAN thì ổn; muốn đưa ra internet nên đặt sau reverse proxy có HTTPS.
- Đáp án trong link thách đấu (chế độ "Gửi link") chỉ được mã hoá nhẹ; người rành kỹ thuật vẫn đọc được trước khi chơi. Phòng online không có vấn đề này vì đáp án được giấu ở server.
