import json
import logging
import random
import socket
import threading
import time

import serial
from flask import Flask, Response, cli, jsonify, request, send_from_directory
from rich.console import Console

console = Console()
setattr(cli, "show_server_banner", lambda *_: None)
logging.getLogger("werkzeug").setLevel(logging.ERROR)

ARDUINO_PORT = "COM8" 
BAUDRATE = 9600
WEB_PORT = 5000

app = Flask(__name__, static_folder="web", static_url_path="")

latest_data = {
    "hum": 0.0,
    "temp": 0.0,
    "ec": 0,
    "ph": 0.0,
    "n": 0,
    "p": 0,
    "k": 0,
    "fert": 0,
    "connected": False,
}


def read_serial():
    global latest_data
    in_debug_mode = False
    while True:
        try:
            with serial.Serial(ARDUINO_PORT, BAUDRATE, timeout=2) as ser:
                console.print(f"[green]ok[/green] connected to {ARDUINO_PORT}")
                in_debug_mode = False
                latest_data["connected"] = True
                while True:
                    line = ser.readline().decode("utf-8", errors="ignore").strip()
                    if line:
                        console.print(f"[cyan]arduino >[/cyan] {line}")
                    if line.startswith("{") and line.endswith("}"):
                        try:
                            data = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        data["connected"] = True
                        latest_data = data
                        notify()
        except Exception:
            base = (
                latest_data
                if in_debug_mode
                else {
                    "hum": 58.0,
                    "temp": 24.5,
                    "ec": 800,
                    "ph": 6.5,
                    "n": 50,
                    "p": 35,
                    "k": 65,
                    "fert": 60,
                }
            )
            if not in_debug_mode:
                console.print(
                    f"[yellow]mock[/yellow] {ARDUINO_PORT} unavailable (using mock data)"
                )
                in_debug_mode = True

            def clamp(v, lo, hi):
                return max(lo, min(hi, v))

            latest_data = {
                "hum": round(
                    clamp(base["hum"] + random.uniform(-0.8, 0.8), 40.0, 75.0), 1
                ),
                "temp": round(
                    clamp(base["temp"] + random.uniform(-0.3, 0.3), 20.0, 30.0), 1
                ),
                "ec": int(clamp(base["ec"] + random.randint(-20, 20), 400, 1200)),
                "ph": round(clamp(base["ph"] + random.uniform(-0.1, 0.1), 5.8, 7.2), 1),
                "n": int(clamp(base["n"] + random.randint(-2, 2), 20, 80)),
                "p": int(clamp(base["p"] + random.randint(-2, 2), 15, 60)),
                "k": int(clamp(base["k"] + random.randint(-3, 3), 30, 100)),
                "fert": int(clamp(base["fert"] + random.randint(-2, 2), 0, 100)),
                "connected": False,
                "debug": True,
            }
            notify()
            time.sleep(0.5)


def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip


@app.route("/")
def index():
    return send_from_directory("web", "index.html")


@app.route("/data")
def data():
    return jsonify(latest_data)


records = []
state_cond = threading.Condition()


def notify():
    with state_cond:
        state_cond.notify_all()


@app.route("/records", methods=["GET", "POST", "DELETE"])
def handle_records():
    if request.method == "POST":
        records.insert(0, request.get_json(force=True))
        notify()
    elif request.method == "DELETE":
        records.clear()
        notify()
    return jsonify(records)


@app.route("/stream")
def stream():
    def gen():
        yield f"data: {json.dumps({'data': latest_data, 'records': records})}\n\n"
        while True:
            with state_cond:
                state_cond.wait()
                payload = json.dumps({"data": latest_data, "records": records})
            yield f"data: {payload}\n\n"

    return Response(gen(), mimetype="text/event-stream")


if __name__ == "__main__":
    serial_thread = threading.Thread(target=read_serial, daemon=True)
    serial_thread.start()

    local_ip = get_local_ip()
    console.print(f"[dim]pc[/dim]     [cyan]http://localhost:{WEB_PORT}[/cyan]")
    console.print(f"[dim]mobile[/dim] [cyan]http://{local_ip}:{WEB_PORT}[/cyan]")
    app.run(host="0.0.0.0", port=WEB_PORT, debug=False)
