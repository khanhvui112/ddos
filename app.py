# app.py
from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
import subprocess
import threading
import queue
import os
import signal
import time
from collections import deque
import sys

app = Flask(__name__)
CORS(app)  # enable CORS để dễ test từ browser

# Lưu thông tin process: pid -> { "proc": Popen, "queue": Queue, "buffer": deque, "lock": Lock }
processes = {}
processes_lock = threading.Lock()
BUFFER_LINES = 200  # lưu 200 dòng gần nhất cho mỗi process

pid_global = 0
APP_LOGS = deque(maxlen=5000)  # giữ 5000 dòng gần nhất
APP_LOGS_LOCK = threading.Lock()

# redirect stdout & stderr
# ORIGINAL_STDOUT = sys.stdout
# ORIGINAL_STDERR = sys.stderr

# class LogCaptureStream:
#     def __init__(self, stream, original):
#         self.stream = stream      # để flush
#         self.original = original  # giữ stream gốc
#
#     def write(self, message):
#         if message.strip():
#             with APP_LOGS_LOCK:
#                 APP_LOGS.append(message.rstrip("\n"))
#         self.original.write(message)  # ghi ra stdout gốc
#         self.original.flush()
#
#     def flush(self):
#         self.original.flush()

# redirect stdout & stderr
# sys.stdout = LogCaptureStream(sys.stdout, ORIGINAL_STDOUT)
# sys.stderr = LogCaptureStream(sys.stderr, ORIGINAL_STDERR)

# @app.route("/applogs", methods=["GET"])
# def app_logs():
#     def generate():
#         # gửi buffer hiện có trước
#         with APP_LOGS_LOCK:
#             for line in list(APP_LOGS):
#                 yield f"data: {line}\n\n"
#
#         last_len = len(APP_LOGS)
#         # sau đó stream log mới
#         while True:
#             with APP_LOGS_LOCK:
#                 if len(APP_LOGS) > last_len:
#                     new_lines = list(APP_LOGS)[last_len:]
#                     last_len = len(APP_LOGS)
#                 else:
#                     new_lines = []
#             for ln in new_lines:
#                 yield f"data: {ln}\n\n"
#             time.sleep(0.5)  # tránh vòng while ăn CPU
#     return Response(stream_with_context(generate()), mimetype="text/event-stream")

# @app.route("/testlog", methods=["GET"])
# def testlog():
#     print("[APP] In thử 1 dòng log từ Flask")
#     return "Đã in log vào console"

def stream_logs(process):
    """Đọc log từ Node.js và in realtime ra console Flask"""
    try:
        for line in iter(process.stdout.readline, ''):
            if line:
                print("[NODE]", line.strip(), flush=True)
    except Exception as e:
        print("[ERROR LOG]", e, flush=True)


def reader_thread(pid, proc, q, buf):
    """Đọc stdout của process và đưa vào queue + buffer."""
    try:
        for line in iter(proc.stdout.readline, ''):
            if line == '' and proc.poll() is not None:
                break
            if line:
                print("[NODE]", line.strip(), flush=True)
                text = line.rstrip("\n")
                # đẩy vào queue (non-blocking với try/except)
                try:
                    q.put(text, block=False)
                except queue.Full:
                    pass
                buf.append(text)
        # khi process kết thúc, thông báo
        exit_msg = f"[__PROCESS_EXIT__] pid={pid} returncode={proc.returncode}"
        try:
            q.put(exit_msg, block=False)
        except queue.Full:
            pass
        buf.append(exit_msg)
    except Exception as e:
        err = f"[__READER_ERROR__] {e}"
        try:
            q.put(err, block=False)
        except:
            pass
        buf.append(err)

@app.route("/run", methods=["POST"])
def run_node():
    data = request.get_json() or {}
    target = data.get("target", "http://example.com")
    ttime = str(data.get("time", "10"))
    threads = str(data.get("threads", "10"))
    ratelimit = str(data.get("ratelimit", "0"))
    proxyfile = data.get("proxyfile", "")
    flags = data.get("flags", [])

    cmd = ["stdbuf", "-oL", "node", "--trace-warnings", "leak-flood.js",
       target, ttime, threads, ratelimit, proxyfile, '--debug', '--reset', '--bypass'] + flags

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            bufsize=1,
            text=True,
            universal_newlines=True
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    pid = proc.pid
    global pid_global
    pid_global = pid
    q = queue.Queue(maxsize=1000)
    buf = deque(maxlen=BUFFER_LINES)

    # start reader thread
    t = threading.Thread(target=reader_thread, args=(pid, proc, q, buf), daemon=True)
    t.start()

    with processes_lock:
        processes[pid] = {
            "proc": proc,
            "queue": q,
            "buffer": buf,
            "thread": t
        }

    return jsonify({
        "message": "Node script started",
        "pid": pid,
        "command": " ".join(cmd)
    }), 201

def event_stream(pid, last_n=0):
    """Generator trả về các dòng log theo định dạng SSE."""
    with processes_lock:
        info = processes.get(pid)
        if not info:
            yield f"data: [ERROR] process {pid} not found\n\n"
            return
        q = info["queue"]
        buf = info["buffer"]
        proc = info["proc"]

    # gửi lại last_n dòng từ buffer khi client vừa kết nối
    if last_n > 0:
        lines_to_send = list(buf)[-last_n:]
        for ln in lines_to_send:
            # escape newlines already removed
            yield f"data: {ln}\n\n"

    # liên tục đọc queue và yield
    # nếu process kết thúc và queue trống -> thoát
    while True:
        try:
            line = q.get(timeout=0.5)
            # SSE requires "data: " prefix và blank line để end event
            yield f"data: {line}\n\n"

            # nếu đây là thông báo process exit, thoát sau gửi
            if line.startswith("[__PROCESS_EXIT__]"):
                break
        except queue.Empty:
            # kiểm tra process vẫn alive không
            if proc.poll() is not None:
                # process đã exit, nhưng có thể còn item trong queue -> tiếp, else break
                try:
                    # nếu queue rỗng -> exit
                    q.get_nowait()
                    # nếu không raise thì có item và đã lấy -> put lại để loop xử lý
                    # (để đơn giản, push back not implemented; nhưng queue.get_nowait() vừa lấy -> ta xử lý lại)
                except queue.Empty:
                    break
                except Exception:
                    break
            # else continue chờ
            continue

@app.route("/logs/<int:pid>")
def logs(pid):
    """
    SSE endpoint:
    - Kết nối từ trình duyệt:
        const es = new EventSource('/logs/123?last=50')
    - Query param last= số dòng buffer muốn nhận ngay khi connect
    """
    global pid_global
    print("Global pid: {}".format(pid))
    if (pid == 11):
        """Sử dụng pid global."""
        pid = pid_global
    last = request.args.get("last", "0")
    try:
        last_n = int(last)
    except:
        last_n = 0

    return Response(stream_with_context(event_stream(pid, last_n=last_n)),
                    mimetype="text/event-stream")

@app.route("/stop", methods=["POST"])
def stop_node():
    data = request.get_json() or {}
    pid = data.get("pid")
    if not pid:
        return jsonify({"error": "Missing pid"}), 400
    try:
        pid = int(pid)
    except:
        return jsonify({"error": "Invalid pid"}), 400

    with processes_lock:
        info = processes.get(pid)
        if not info:
            return jsonify({"error": "Process not found"}), 404
        proc = info["proc"]

    try:
        # gửi SIGTERM, chờ 3s, nếu vẫn sống -> SIGKILL
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()
        return jsonify({"message": f"Process {pid} stopped"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        with processes_lock:
            processes.pop(pid, None)

@app.route("/list")
def list_processes():
    """Danh sách process đang quản lý (pid + status)"""
    out = []
    with processes_lock:
        for pid, info in processes.items():
            proc = info["proc"]
            status = "running" if proc.poll() is None else f"exited({proc.returncode})"
            out.append({"pid": pid, "status": status})
    return jsonify(out)

@app.route("/view")
def view_logs():
    html = """
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <title>Xem log realtime</title>
      <style>
        body {
          font-family: monospace;
          background: #1e1e1e;
          color: #dcdcdc;
          margin: 0;
          padding: 0;
        }
        #controls {
          padding: 10px;
          background: #333;
        }
        #logs {
          white-space: pre-wrap;
          padding: 10px;
          height: 90vh;
          overflow-y: auto;
          line-height: 1.4;
        }
        .line { margin: 0; }
        .error { color: #ff6b6b; }
        .info { color: #6bc1ff; }
      </style>
    </head>
    <body>
      <div id="controls">
        <label>PID: <input type="number" id="pid" value="11"></label>
        <button onclick="connect()">Kết nối log</button>
        <button onclick="disconnect()">Ngắt</button>
      </div>
      <div id="logs"></div>

      <script>
        let es = null;
        const logsDiv = document.getElementById("logs");

        function appendLog(line, cls="") {
          const el = document.createElement("div");
          el.textContent = line;
          if (cls) el.classList.add(cls);
          logsDiv.appendChild(el);
          logsDiv.scrollTop = logsDiv.scrollHeight;
        }
        let interval = setInterval(async function(){
            connect();
        }, 1000 * 15)
        function connect() {
          const pid = document.getElementById("pid").value;
          if (!pid) {
            alert("Nhập PID trước!");
            return;
          }
          if (es) es.close();

          es = new EventSource(`/logs/${pid}?last=50`);
          appendLog(`--- Kết nối tới PID ${pid} ---`, "info");

          es.onmessage = (e) => {
            appendLog(e.data);
          };

          es.onerror = (e) => {
            appendLog("[Lỗi SSE hoặc mất kết nối]", "error");
            es.close();
            es = null;
          };
        }

        function disconnect() {
          if (es) {
            es.close();
            es = null;
            appendLog("--- Đã ngắt kết nối ---", "info");
          }
        }
      </script>
    </body>
    </html>
    """
    return Response(html, mimetype="text/html")

# @app.route("/applogs_view")
# def applogs_view():
#     html = """
#     <!DOCTYPE html>
#     <html lang="vi">
#     <head>
#       <meta charset="UTF-8">
#       <title>Xem APP Logs realtime</title>
#       <style>
#         body {
#           font-family: monospace;
#           background: #1e1e1e;
#           color: #dcdcdc;
#           margin: 0;
#           padding: 0;
#         }
#         #controls {
#           padding: 10px;
#           background: #333;
#         }
#         #logs {
#           white-space: pre-wrap;
#           padding: 10px;
#           height: 90vh;
#           overflow-y: auto;
#           line-height: 1.4;
#         }
#         .line { margin: 0; }
#         .error { color: #ff6b6b; }
#         .info { color: #6bc1ff; }
#       </style>
#     </head>
#     <body>
#       <div id="controls">
#         <button onclick="connect()">Kết nối App Logs</button>
#         <button onclick="disconnect()">Ngắt</button>
#       </div>
#       <div id="logs"></div>
#
#       <script>
#         let es = null;
#         const logsDiv = document.getElementById("logs");
#
#         function appendLog(line, cls="") {
#           const el = document.createElement("div");
#           el.textContent = line;
#           if (cls) el.classList.add(cls);
#           logsDiv.appendChild(el);
#           logsDiv.scrollTop = logsDiv.scrollHeight;
#         }
#
#         function connect() {
#           if (es) es.close();
#           es = new EventSource("/applogs");
#           appendLog("--- Kết nối App Logs ---", "info");
#
#           es.onmessage = (e) => {
#             appendLog(e.data);
#           };
#
#           es.onerror = (e) => {
#             appendLog("[Lỗi SSE hoặc mất kết nối]", "error");
#             es.close();
#             es = null;
#           };
#         }
#
#         function disconnect() {
#           if (es) {
#             es.close();
#             es = null;
#             appendLog("--- Đã ngắt kết nối ---", "info");
#           }
#         }
#       </script>
#     </body>
#     </html>
#     """
#     return Response(html, mimetype="text/html")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True, threaded=True)
