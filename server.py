#!/usr/bin/env python3
"""Nhãn Lực — server tĩnh + phòng online (2–4 máy). Chỉ dùng thư viện chuẩn.

Chạy:   python3 server.py                # cổng 8000, mở cho cả mạng LAN
        python3 server.py --port 9000 --host 127.0.0.1

Đồng bộ thời gian thực bằng Server-Sent Events (GET /api/rooms/<ID>/events),
thao tác gửi bằng POST JSON. Mọi quyền trưởng phòng được kiểm tra ở server.
Dữ liệu phòng chỉ nằm trong RAM — tắt server là mất.
"""
import argparse
import json
import os
import re
import secrets
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC = {'/': 'index.html', '/index.html': 'index.html', '/style.css': 'style.css', '/game.js': 'game.js'}
CTYPES = {'.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8'}

MAX_PLAYERS = 4
MAX_ROOMS = 200
ROOM_IDLE_TTL_S = 3 * 3600
MAX_BODY = 32 * 1024
START_DELAY_MS = 4000          # đếm ngược đồng bộ trước khi cả phòng bắt đầu
DEADLINE_GRACE_MS = 4000       # bù trễ mạng khi hết giờ "cả lượt"
HEARTBEAT_S = 15
POLL_WAIT_S = 20     # long-poll: giữ request tối đa 20s chờ phòng thay đổi
POLL_ONLINE_S = 40   # máy dùng long-poll coi là online nếu poll trong 40s gần nhất
ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
COLORS = ('p1', 'p2', 'p3', 'p4')
ROOM_RE = re.compile(r'^/api/rooms/([A-Z0-9]{5})/([a-z]+)$')


def now_ms():
    return int(time.time() * 1000)


def rand_code(n=5):
    return ''.join(secrets.choice(ALPHA) for _ in range(n))


class ApiError(Exception):
    def __init__(self, status, msg):
        super().__init__(msg)
        self.status = status
        self.msg = msg


def is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def clean_name(v):
    s = ''.join(ch for ch in str(v or '') if ch.isprintable()).strip()[:20]
    if not s:
        raise ApiError(400, 'Thiếu tên người chơi')
    return s


def valid_code(v):
    s = ''.join(ch for ch in str(v or '').upper() if ch.isascii() and ch.isalnum())[:12]
    if not s:
        raise ApiError(400, 'Mã đề không hợp lệ')
    return s


def valid_timer(t):
    if t is None:
        return None
    if not isinstance(t, dict) or t.get('scope') not in ('turn', 'event'):
        raise ApiError(400, 'Giới hạn thời gian không hợp lệ')
    sec = t.get('sec')
    if not is_int(sec) or not 5 <= sec <= 3600:
        raise ApiError(400, 'Số giây phải từ 5 đến 3600')
    return {'scope': t['scope'], 'sec': sec}


def valid_answer(a):
    if a is None:
        return None
    if not isinstance(a, dict) or len(json.dumps(a)) > 2000:
        raise ApiError(400, 'Câu trả lời không hợp lệ')
    return a


class Room:
    def __init__(self, rid):
        self.id = rid
        self.state = 'lobby'            # lobby | playing | done
        self.round = 0
        self.config = {'code': rand_code(), 'timer': {'scope': 'turn', 'sec': 90}}
        self.start_at = None
        self.players = []
        self.host_id = None
        self.version = 0
        self.touched = time.time()

    def by_token(self, token):
        if not isinstance(token, str) or not token:
            return None
        for p in self.players:
            if secrets.compare_digest(p['token'], token):
                return p
        return None

    def by_id(self, pid):
        return next((p for p in self.players if p['id'] == pid), None)

    def add_player(self, name):
        if len(self.players) >= MAX_PLAYERS:
            raise ApiError(409, f'Phòng đã đủ {MAX_PLAYERS} người')
        used = {p['color'] for p in self.players}
        p = {
            'id': secrets.token_hex(4), 'token': secrets.token_urlsafe(18), 'name': name,
            'color': next(c for c in COLORS if c not in used), 'conns': 0, 'seen': 0.0, 'was_on': False,
            'answers': [], 'time_ms': None, 'done': False,
        }
        self.players.append(p)
        if self.host_id is None:
            self.host_id = p['id']
        return p

    def remove_player(self, pid):
        self.players = [p for p in self.players if p['id'] != pid]
        if self.host_id == pid:
            self.host_id = self.players[0]['id'] if self.players else None
        self.check_done()

    def turn_cap_ms(self):
        t = self.config.get('timer')
        return t['sec'] * 1000 if t and t['scope'] == 'turn' else None

    def deadline(self):
        cap = self.turn_cap_ms()
        if self.state != 'playing' or cap is None:
            return None
        return self.start_at + cap + DEADLINE_GRACE_MS

    def finish_player(self, p, time_ms):
        while len(p['answers']) < 5:
            p['answers'].append(None)
        p['done'] = True
        p['time_ms'] = time_ms

    def check_done(self):
        if self.state == 'playing' and self.players and all(p['done'] for p in self.players):
            self.state = 'done'

    def snapshot(self, viewer_id):
        reveal = self.state == 'done'
        players = []
        for p in self.players:
            d = {'id': p['id'], 'name': p['name'], 'color': p['color'], 'online': is_online(p),
                 'progress': len(p['answers']), 'done': p['done']}
            # Đáp án người khác chỉ lộ khi cả phòng xong; của mình thì luôn có (để chơi tiếp khi reload)
            if reveal or p['id'] == viewer_id:
                d['answers'] = p['answers']
                d['timeMs'] = p['time_ms']
            players.append(d)
        return {
            'id': self.id, 'state': self.state, 'round': self.round, 'config': self.config,
            'startAt': self.start_at, 'serverNow': now_ms(), 'hostId': self.host_id,
            'you': viewer_id, 'players': players, 'v': self.version,
        }

    def bump(self):
        """Gọi khi đang giữ COND: tăng version và đánh thức mọi luồng SSE."""
        self.version += 1
        self.touched = time.time()
        COND.notify_all()


def is_online(p):
    # SSE: đang giữ kết nối; long-poll (qua tunnel/proxy không hỗ trợ SSE): vừa poll gần đây
    return p['conns'] > 0 or time.time() - p['seen'] < POLL_ONLINE_S


COND = threading.Condition()
ROOMS = {}


# ---------- actions (luôn chạy khi đang giữ COND) ----------
def require(room, data, host=False):
    p = room.by_token(data.get('token'))
    if p is None:
        raise ApiError(403, 'Bạn không ở trong phòng này')
    if host and p['id'] != room.host_id:
        raise ApiError(403, 'Chỉ trưởng phòng được làm việc này')
    return p


def act_join(room, data):
    p = room.by_token(data.get('token'))
    if p is None:
        if room.state != 'lobby':
            raise ApiError(409, 'Phòng đang thi đấu, chờ ván sau nhé')
        p = room.add_player(clean_name(data.get('name')))
    return {'roomId': room.id, 'playerId': p['id'], 'token': p['token']}


def act_config(room, data):
    require(room, data, host=True)
    if room.state != 'lobby':
        raise ApiError(409, 'Chỉ chỉnh được cài đặt khi đang ở phòng chờ')
    cfg = data.get('config')
    if not isinstance(cfg, dict):
        raise ApiError(400, 'Cài đặt không hợp lệ')
    room.config = {'code': valid_code(cfg.get('code')), 'timer': valid_timer(cfg.get('timer'))}


def act_start(room, data):
    require(room, data, host=True)
    if room.state != 'lobby':
        raise ApiError(409, 'Trận đã bắt đầu')
    if len(room.players) < 2:
        raise ApiError(409, 'Cần ít nhất 2 người')
    room.state = 'playing'
    room.round += 1
    room.start_at = now_ms() + START_DELAY_MS
    for p in room.players:
        p.update(answers=[], done=False, time_ms=None)


def act_answer(room, data):
    p = require(room, data)
    if room.state != 'playing' or p['done']:
        raise ApiError(409, 'Lượt chơi đã kết thúc')
    idx = data.get('idx')
    if not is_int(idx) or not 0 <= idx < 5:
        raise ApiError(400, 'Thứ tự thử thách không hợp lệ')
    if idx < len(p['answers']):
        return  # gửi lặp do retry — bỏ qua
    if idx > len(p['answers']):
        raise ApiError(409, 'Sai thứ tự thử thách')
    if now_ms() < room.start_at - 1000:
        raise ApiError(409, 'Trận chưa bắt đầu')
    dl = room.deadline()
    if dl is not None and now_ms() > dl:
        raise ApiError(409, 'Đã hết giờ')
    p['answers'].append(valid_answer(data.get('answer')))


def act_finish(room, data):
    p = require(room, data)
    if room.state != 'playing':
        raise ApiError(409, 'Lượt chơi đã kết thúc')
    if p['done']:
        return
    t = data.get('timeMs')
    t = int(t) if isinstance(t, (int, float)) and not isinstance(t, bool) and t >= 0 else None
    cap = room.turn_cap_ms()
    if t is not None and cap is not None:
        t = min(t, cap)
    room.finish_player(p, t)
    room.check_done()


def act_force(room, data):
    require(room, data, host=True)
    if room.state != 'playing':
        raise ApiError(409, 'Không có trận nào đang diễn ra')
    for p in room.players:
        if not p['done']:
            room.finish_player(p, room.turn_cap_ms())
    room.check_done()


def act_reset(room, data):
    require(room, data, host=True)
    if room.state != 'done':
        raise ApiError(409, 'Trận chưa kết thúc')
    room.state = 'lobby'
    room.start_at = None
    room.config = {**room.config, 'code': rand_code()}
    for p in room.players:
        p.update(answers=[], done=False, time_ms=None)


def act_kick(room, data):
    require(room, data, host=True)
    target = room.by_id(data.get('playerId'))
    if target is None:
        raise ApiError(404, 'Không tìm thấy người chơi')
    if target['id'] == room.host_id:
        raise ApiError(400, 'Không thể tự mời mình ra')
    room.remove_player(target['id'])


def act_leave(room, data):
    p = require(room, data)
    room.remove_player(p['id'])


ACTIONS = {
    'join': act_join, 'config': act_config, 'start': act_start, 'answer': act_answer,
    'finish': act_finish, 'force': act_force, 'reset': act_reset, 'kick': act_kick, 'leave': act_leave,
}


def cleanup_locked():
    cutoff = time.time() - ROOM_IDLE_TTL_S
    for rid, room in list(ROOMS.items()):
        if room.touched < cutoff and not any(is_online(p) for p in room.players):
            del ROOMS[rid]
            COND.notify_all()


def create_room(data):
    name = clean_name(data.get('name'))
    with COND:
        cleanup_locked()
        if len(ROOMS) >= MAX_ROOMS:
            raise ApiError(503, 'Server đang đủ phòng, thử lại sau')
        rid = rand_code()
        while rid in ROOMS:
            rid = rand_code()
        room = Room(rid)
        ROOMS[rid] = room
        p = room.add_player(name)
        room.bump()
    return {'roomId': rid, 'playerId': p['id'], 'token': p['token']}


def poll(rid, token, v):
    """Long-poll thay cho SSE (Cloudflare Quick Tunnel, vài proxy không chuyển SSE).
    Trả snapshot ngay nếu version khác v, không thì chờ tối đa POLL_WAIT_S."""
    try:
        v = int(v)
    except ValueError:
        v = -1
    end = time.time() + POLL_WAIT_S
    with COND:
        while True:
            room = ROOMS.get(rid)
            if room is None:
                raise ApiError(404, 'Phòng không tồn tại hoặc đã đóng')
            p = room.by_token(token)
            if p is None:
                raise ApiError(403, 'Bạn không còn trong phòng này (có thể đã bị mời ra)')
            was_on = is_online(p)
            p['seen'] = time.time()
            if not was_on:
                p['was_on'] = True
                room.bump()
            left = end - time.time()
            if room.version != v or left <= 0:
                return room.snapshot(p['id'])
            COND.wait(timeout=left)


def ticker():
    """Tự kết thúc lượt khi hết giờ 'cả lượt' (kể cả máy bị rớt mạng) + dọn phòng bỏ hoang."""
    while True:
        time.sleep(1)
        with COND:
            t = now_ms()
            for room in list(ROOMS.values()):
                dl = room.deadline()
                if dl is not None and t > dl:
                    for p in room.players:
                        if not p['done']:
                            room.finish_player(p, room.turn_cap_ms())
                    room.check_done()
                    room.bump()
                # Báo cho cả phòng khi một máy long-poll mất kết nối/quay lại
                changed = False
                for p in room.players:
                    on = is_online(p)
                    if on != p['was_on']:
                        p['was_on'], changed = on, True
                if changed:
                    room.bump()
            cleanup_locked()


class Handler(BaseHTTPRequestHandler):
    server_version = 'NhanLuc/1.0'

    def log_message(self, fmt, *args):
        if '/events' in self.path or '/answer' in self.path:
            return
        super().log_message(fmt, *args)

    def send_json(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        try:
            n = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            n = 0
        if n <= 0:
            raise ApiError(400, 'Thiếu dữ liệu')
        if n > MAX_BODY:
            raise ApiError(413, 'Dữ liệu quá lớn')
        try:
            data = json.loads(self.rfile.read(n))
        except (ValueError, UnicodeDecodeError):
            raise ApiError(400, 'JSON không hợp lệ')
        if not isinstance(data, dict):
            raise ApiError(400, 'JSON không hợp lệ')
        return data

    def serve_static(self, name):
        path = os.path.join(ROOT, name)
        try:
            with open(path, 'rb') as f:
                body = f.read()
        except OSError:
            return self.send_json(404, {'error': 'Không tìm thấy'})
        self.send_response(200)
        self.send_header('Content-Type', CTYPES[os.path.splitext(name)[1]])
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path in STATIC:
            return self.serve_static(STATIC[url.path])
        if url.path == '/api/ping':
            return self.send_json(200, {'ok': True, 'app': 'nhanluc'})
        m = ROOM_RE.match(url.path)
        q = parse_qs(url.query)
        if m and m.group(2) == 'events':
            return self.stream(m.group(1), q.get('token', [''])[0])
        if m and m.group(2) == 'poll':
            try:
                return self.send_json(200, poll(m.group(1), q.get('token', [''])[0], q.get('v', ['-1'])[0]))
            except ApiError as e:
                return self.send_json(e.status, {'error': e.msg})
        self.send_json(404, {'error': 'Không tìm thấy'})

    def do_POST(self):
        url = urlparse(self.path)
        try:
            data = self.read_json()
            if url.path == '/api/rooms':
                return self.send_json(200, create_room(data))
            m = ROOM_RE.match(url.path)
            fn = ACTIONS.get(m.group(2)) if m else None
            if fn is None:
                raise ApiError(404, 'Không tìm thấy')
            with COND:
                room = ROOMS.get(m.group(1))
                if room is None:
                    raise ApiError(404, 'Phòng không tồn tại hoặc đã đóng')
                result = fn(room, data) or {}
                room.bump()
                if not room.players:
                    del ROOMS[room.id]
            self.send_json(200, {'ok': True, **result})
        except ApiError as e:
            self.send_json(e.status, {'error': e.msg})

    def stream(self, rid, token):
        with COND:
            room = ROOMS.get(rid)
            p = room.by_token(token) if room else None
            if p:
                pid = p['id']
                p['conns'] += 1
                room.bump()
        if room is None:
            return self.send_json(404, {'error': 'Phòng không tồn tại hoặc đã đóng'})
        if p is None:
            return self.send_json(403, {'error': 'Bạn không ở trong phòng này'})

        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream; charset=utf-8')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Accel-Buffering', 'no')
        self.end_headers()
        last = -1
        try:
            # retry: trình duyệt kết nối lại sau 1.5s nếu rớt mạng.
            # 2KB đệm: vài trình duyệt/proxy giữ lại vài KB đầu trước khi giao sự kiện.
            self.wfile.write(b'retry: 1500\n:' + b' ' * 2048 + b'\n\n')
            self.wfile.flush()
            while True:
                with COND:
                    room = ROOMS.get(rid)
                    if room is not None and room.version == last:
                        COND.wait(timeout=HEARTBEAT_S)
                        room = ROOMS.get(rid)
                    final = False
                    if room is None:
                        msg, final = {'gone': True, 'reason': 'closed'}, True
                    elif room.by_id(pid) is None:
                        msg, final = {'gone': True, 'reason': 'kicked'}, True
                    elif room.version != last:
                        msg, last = room.snapshot(pid), room.version
                    else:
                        msg = None
                if msg is None:
                    self.wfile.write(b': ping\n\n')
                else:
                    self.wfile.write(f'data: {json.dumps(msg, ensure_ascii=False)}\n\n'.encode())
                self.wfile.flush()
                if final:
                    break
        except OSError:
            pass  # trình duyệt đóng kết nối
        finally:
            with COND:
                room = ROOMS.get(rid)
                pl = room.by_id(pid) if room else None
                if pl:
                    pl['conns'] = max(0, pl['conns'] - 1)
                    room.bump()


def lan_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(('10.255.255.255', 1))  # UDP: không gửi gói nào, chỉ để hỏi IP
            return s.getsockname()[0]
    except OSError:
        return None


def main():
    ap = argparse.ArgumentParser(description='Nhãn Lực server')
    ap.add_argument('--host', default='0.0.0.0')
    ap.add_argument('--port', type=int, default=8000)
    args = ap.parse_args()
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    httpd.daemon_threads = True
    threading.Thread(target=ticker, daemon=True).start()
    print(f'Nhãn Lực đang chạy: http://localhost:{args.port}')
    ip = lan_ip()
    if ip and args.host in ('0.0.0.0', ''):
        print(f'Máy khác cùng mạng:  http://{ip}:{args.port}')
    print('Ctrl+C để dừng.')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == '__main__':
    main()
