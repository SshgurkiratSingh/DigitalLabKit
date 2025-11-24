import threading
import time
import struct
import queue

import serial
import serial.tools.list_ports

import tkinter as tk
from tkinter import ttk, messagebox

# ================= USER CONFIG =================

DEFAULT_BAUD = 115200
START_BYTE = 0xAA

ROLE_NAMES = {
    0: "IN",
    1: "OUT",
    2: "GND",
    3: "VCC",
    4: "UNUSED",
    5: "CLK",
}

ROLE_CODES_BY_NAME = {v: k for k, v in ROLE_NAMES.items()}

NUM_PINS = 16


# ================= PROTOCOL HELPERS ============

def calc_checksum(cmd, payload):
    length = len(payload)
    s = cmd + length + sum(payload)
    return (0xFF - (s & 0xFF)) & 0xFF


def make_packet(cmd, payload_bytes):
    length = len(payload_bytes)
    chk = calc_checksum(cmd, payload_bytes)
    return bytes([START_BYTE, cmd, length]) + payload_bytes + bytes([chk])


# ================= IC NODE CLIENT (SERIAL) =====

class ICNodeClient:
    def __init__(self, port, baud, event_queue, log_func=None):
        self.port_name = port
        self.baud = baud
        self.event_queue = event_queue
        self.log = log_func or (lambda msg: None)

        self.ser = None
        self.lock = threading.Lock()
        self.running = False
        self.reader_thread = None

    def connect(self):
        try:
            self.ser = serial.Serial(self.port_name, self.baud, timeout=0.1)
            self.running = True
            self.reader_thread = threading.Thread(target=self._reader_loop, daemon=True)
            self.reader_thread.start()
            time.sleep(2.0)  # wait for Arduino reboot
            self.log(f"[INFO] Connected to {self.port_name} @ {self.baud}")
            return True
        except Exception as e:
            self.log(f"[ERROR] Failed to open {self.port_name}: {e}")
            return False

    def close(self):
        self.running = False
        if self.ser:
            try:
                self.ser.close()
            except Exception:
                pass
            self.ser = None
        self.log("[INFO] Disconnected")

    # ---------- public API ----------

    def send_set_role(self, pin, role_code):
        payload = bytes([pin & 0xFF, role_code & 0xFF])
        self._send(0x01, payload)

    def send_set_level(self, pin, value):
        payload = bytes([pin & 0xFF, (1 if value else 0) & 0xFF])
        self._send(0x02, payload)

    def send_clk_config(self, on_ms, off_ms):
        payload = struct.pack("<HH", on_ms, off_ms)
        self._send(0x03, payload)

    def send_clk_enable(self, enable):
        payload = bytes([1 if enable else 0])
        self._send(0x04, payload)

    def send_reset(self):
        self._send(0x05, b"")

    def send_sync_request(self):
        self._send(0x06, b"")

    def send_status_request(self):
        self._send(0x07, b"")

    # ---------- low-level send ----------

    def _send(self, cmd, payload):
        if not self.ser or not self.ser.is_open:
            self.log("[WARN] Cannot send, not connected.")
            return
        pkt = make_packet(cmd, payload)
        with self.lock:
            try:
                self.ser.write(pkt)
            except Exception as e:
                self.log(f"[ERROR] Serial write failed: {e}")

    # ========== RX PARSER / READER THREAD ==========

    def _reader_loop(self):
        state = "WAIT_START"
        cmd = 0
        length = 0
        payload = bytearray()

        while self.running:
            try:
                b = self.ser.read(1)
                if not b:
                    continue
                byte = b[0]

                if state == "WAIT_START":
                    if byte == START_BYTE:
                        state = "CMD"

                elif state == "CMD":
                    cmd = byte
                    state = "LEN"

                elif state == "LEN":
                    length = byte
                    payload = bytearray()
                    if length == 0:
                        state = "CHK"
                    else:
                        state = "PAYLOAD"

                elif state == "PAYLOAD":
                    payload.append(byte)
                    if len(payload) >= length:
                        state = "CHK"

                elif state == "CHK":
                    chk = byte
                    if chk == calc_checksum(cmd, payload):
                        self._handle_frame(cmd, bytes(payload))
                    else:
                        self.log("[WARN] Bad checksum, dropping frame")
                    state = "WAIT_START"

            except Exception as e:
                self.log(f"[ERROR] Reader thread exception: {e}")
                break

        self.running = False

    def _handle_frame(self, cmd, payload):
        if cmd == 0x80:
            if len(payload) == 2:
                ref_cmd, status = payload
                self.event_queue.put(("ack", ref_cmd, status))
        elif cmd == 0x81:
            self.event_queue.put(("status", payload))
        elif cmd == 0x82:
            self.event_queue.put(("sync", payload))
        else:
            self.event_queue.put(("unknown", cmd, payload))


# ================= TKINTER GUI ==========================

class ICNodeGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("IC Node Visualizer")

        self.event_queue = queue.Queue()
        self.client = None

        # local model (GUI is master for roles)
        self.pin_roles = [4] * NUM_PINS
        self.pin_levels = [0] * NUM_PINS

        # pending states for levels only (roles we just ignore remote)
        self.pending_level = [None] * NUM_PINS

        self.selected_pin = 0

        self._build_ui()
        self._populate_ports()

        self.root.after(50, self.process_events)

    # ---------- UI BUILD ----------

    def _build_ui(self):
        main = ttk.Frame(self.root, padding=10)
        main.pack(fill="both", expand=True)

        # Connection
        conn_frame = ttk.LabelFrame(main, text="Connection")
        conn_frame.pack(fill="x", pady=5)

        ttk.Label(conn_frame, text="Port:").pack(side="left")
        self.port_var = tk.StringVar()
        self.port_combo = ttk.Combobox(conn_frame, textvariable=self.port_var, width=20)
        self.port_combo.pack(side="left", padx=5)

        ttk.Label(conn_frame, text="Baud:").pack(side="left")
        self.baud_var = tk.StringVar(value=str(DEFAULT_BAUD))
        self.baud_entry = ttk.Entry(conn_frame, textvariable=self.baud_var, width=8)
        self.baud_entry.pack(side="left", padx=5)

        self.connect_btn = ttk.Button(conn_frame, text="Connect", command=self.on_connect)
        self.connect_btn.pack(side="left", padx=5)

        self.disconnect_btn = ttk.Button(conn_frame, text="Disconnect", command=self.on_disconnect, state="disabled")
        self.disconnect_btn.pack(side="left", padx=5)

        # Middle area
        mid_frame = ttk.Frame(main)
        mid_frame.pack(fill="both", expand=True, pady=5)

        # Pin grid
        pins_frame = ttk.LabelFrame(mid_frame, text="Pins (visual)")
        pins_frame.pack(side="left", padx=5, pady=5)

        self.pin_buttons = []
        for r in range(4):
            for c in range(4):
                idx = r * 4 + c
                btn = tk.Button(
                    pins_frame,
                    text=f"P{idx}",
                    width=6,
                    command=lambda i=idx: self.on_pin_clicked(i)
                )
                btn.grid(row=r, column=c, padx=2, pady=2)
                self.pin_buttons.append(btn)

        # Right controls
        right_frame = ttk.Frame(mid_frame)
        right_frame.pack(side="left", fill="both", expand=True, padx=10)

        # Selected pin controls
        pin_ctrl = ttk.LabelFrame(right_frame, text="Selected Pin")
        pin_ctrl.pack(fill="x", pady=5)

        self.sel_pin_label = ttk.Label(pin_ctrl, text="Pin: 0")
        self.sel_pin_label.pack(anchor="w")

        ttk.Label(pin_ctrl, text="Role:").pack(anchor="w")
        self.role_var = tk.StringVar(value="UNUSED")
        self.role_combo = ttk.Combobox(
            pin_ctrl,
            textvariable=self.role_var,
            values=list(ROLE_NAMES.values()),
            state="readonly",
            width=10,
        )
        self.role_combo.pack(anchor="w", pady=2)

        self.apply_role_btn = ttk.Button(pin_ctrl, text="Apply Role", command=self.on_apply_role)
        self.apply_role_btn.pack(anchor="w", pady=2)

        self.level_var = tk.IntVar(value=0)
        level_frame = ttk.Frame(pin_ctrl)
        level_frame.pack(anchor="w", pady=4)
        ttk.Label(level_frame, text="Level:").pack(side="left")
        ttk.Radiobutton(level_frame, text="0", variable=self.level_var, value=0, command=self.on_level_change).pack(
            side="left"
        )
        ttk.Radiobutton(level_frame, text="1", variable=self.level_var, value=1, command=self.on_level_change).pack(
            side="left"
        )

        # Clock controls
        clk_frame = ttk.LabelFrame(right_frame, text="Clock")
        clk_frame.pack(fill="x", pady=5)

        self.on_time_var = tk.StringVar(value="1000")
        self.off_time_var = tk.StringVar(value="1000")

        row1 = ttk.Frame(clk_frame)
        row1.pack(anchor="w", pady=2)
        ttk.Label(row1, text="ON ms:").pack(side="left")
        ttk.Entry(row1, textvariable=self.on_time_var, width=8).pack(side="left", padx=4)

        row2 = ttk.Frame(clk_frame)
        row2.pack(anchor="w", pady=2)
        ttk.Label(row2, text="OFF ms:").pack(side="left")
        ttk.Entry(row2, textvariable=self.off_time_var, width=8).pack(side="left", padx=4)

        self.clk_cfg_btn = ttk.Button(clk_frame, text="Set Clock", command=self.on_clk_config)
        self.clk_cfg_btn.pack(anchor="w", pady=2)

        self.clk_enable_var = tk.IntVar(value=0)
        self.clk_enable_chk = ttk.Checkbutton(
            clk_frame, text="Clock Enabled", variable=self.clk_enable_var, command=self.on_clk_enable
        )
        self.clk_enable_chk.pack(anchor="w", pady=2)

        # Commands
        cmd_frame = ttk.LabelFrame(right_frame, text="Commands")
        cmd_frame.pack(fill="x", pady=5)

        ttk.Button(cmd_frame, text="Reset ALL pins", command=self.on_reset).pack(anchor="w", pady=2)
        ttk.Button(cmd_frame, text="Request SYNC", command=self.on_sync).pack(anchor="w", pady=2)
        ttk.Button(cmd_frame, text="Request STATUS now", command=self.on_status_req).pack(anchor="w", pady=2)

        # Pin table
        table_frame = ttk.LabelFrame(main, text="All Pins (Role + Level)")
        table_frame.pack(fill="x", pady=5)

        self.pin_table = ttk.Treeview(
            table_frame,
            columns=("pin", "role", "level"),
            show="headings",
            height=8,
        )
        self.pin_table.heading("pin", text="Pin")
        self.pin_table.heading("role", text="Role")
        self.pin_table.heading("level", text="Level")

        self.pin_table.column("pin", width=50, anchor="center")
        self.pin_table.column("role", width=80, anchor="center")
        self.pin_table.column("level", width=60, anchor="center")

        self.pin_table.pack(fill="x", padx=5, pady=5)

        for i in range(NUM_PINS):
            self.pin_table.insert("", "end", iid=str(i), values=(i, "UNUSED", 0))

        # Log
        log_frame = ttk.LabelFrame(main, text="Log")
        log_frame.pack(fill="both", expand=True, pady=5)

        self.log_text = tk.Text(log_frame, height=8, wrap="word")
        self.log_text.pack(fill="both", expand=True)
        self.log_text.configure(state="disabled")

        self.update_pin_visuals()

    # ---------- Connection ----------

    def _populate_ports(self):
        ports = [p.device for p in serial.tools.list_ports.comports()]
        self.port_combo["values"] = ports
        if ports:
            self.port_var.set(ports[0])

    def on_connect(self):
        if self.client is not None:
            messagebox.showinfo("Info", "Already connected")
            return

        port = self.port_var.get().strip()
        if not port:
            messagebox.showerror("Error", "No serial port selected")
            return

        try:
            baud = int(self.baud_var.get())
        except ValueError:
            messagebox.showerror("Error", "Invalid baud rate")
            return

        self.client = ICNodeClient(port, baud, self.event_queue, log_func=self.log)
        if not self.client.connect():
            self.client = None
            return

        self.connect_btn["state"] = "disabled"
        self.disconnect_btn["state"] = "normal"

    def on_disconnect(self):
        if self.client:
            self.client.close()
            self.client = None
        self.connect_btn["state"] = "normal"
        self.disconnect_btn["state"] = "disabled"

    # ---------- Logging ----------

    def log(self, msg):
        self.log_text.configure(state="normal")
        self.log_text.insert("end", msg + "\n")
        self.log_text.see("end")
        self.log_text.configure(state="disabled")

    # ---------- Pin controls ----------

    def on_pin_clicked(self, idx):
        self.selected_pin = idx
        self.sel_pin_label.configure(text=f"Pin: {idx}")
        role_code = self.pin_roles[idx]
        role_name = ROLE_NAMES.get(role_code, "UNUSED")
        self.role_var.set(role_name)
        self.level_var.set(self.pin_levels[idx])
        self.update_pin_visuals()

    def on_apply_role(self):
        if not self.client:
            self.log("[WARN] Not connected.")
            return
        role_name = self.role_var.get()
        role_code = ROLE_CODES_BY_NAME.get(role_name, 4)
        pin = self.selected_pin

        # GUI is master for roles
        self.pin_roles[pin] = role_code
        self.update_pin_visuals()

        self.client.send_set_role(pin, role_code)

    def on_level_change(self):
        if not self.client:
            return
        pin = self.selected_pin
        val = self.level_var.get()

        self.pin_levels[pin] = val
        self.pending_level[pin] = val
        self.update_pin_visuals()

        self.client.send_set_level(pin, val)

    # ---------- Clock ----------

    def on_clk_config(self):
        if not self.client:
            self.log("[WARN] Not connected.")
            return
        try:
            on_ms = int(self.on_time_var.get())
            off_ms = int(self.off_time_var.get())
        except ValueError:
            messagebox.showerror("Error", "Clock times must be integers")
            return
        self.client.send_clk_config(on_ms, off_ms)

    def on_clk_enable(self):
        if not self.client:
            return
        en = bool(self.clk_enable_var.get())
        self.client.send_clk_enable(en)

    # ---------- Global commands ----------

    def on_reset(self):
        if not self.client:
            self.log("[WARN] Not connected.")
            return
        if messagebox.askyesno("Confirm", "Reset all pins?"):
            self.client.send_reset()
            self.pin_roles = [4] * NUM_PINS
            self.pin_levels = [0] * NUM_PINS
            self.pending_level = [None] * NUM_PINS
            self.update_pin_visuals()

    def on_sync(self):
        if not self.client:
            self.log("[WARN] Not connected.")
            return
        self.client.send_sync_request()

    def on_status_req(self):
        if not self.client:
            self.log("[WARN] Not connected.")
            return
        self.client.send_status_request()

    # ---------- Visuals ----------

    def update_pin_visuals(self):
        for idx, btn in enumerate(self.pin_buttons):
            role = self.pin_roles[idx]
            level = self.pin_levels[idx]

            btn.configure(text=f"P{idx}")

            if role == 0:  # IN
                bg = "#87CEFA"
            elif role == 1:  # OUT
                bg = "#32CD32" if level else "#006400"
            elif role == 2:  # GND
                bg = "#202020"
            elif role == 3:  # VCC
                bg = "#FF4500"
            elif role == 4:  # UNUSED
                bg = "#A9A9A9"
            elif role == 5:  # CLK
                bg = "#FFD700" if level else "#B8860B"
            else:
                bg = "#A9A9A9"

            fg = "white" if role in (1, 2, 3, 5) else "black"

            if idx == self.selected_pin:
                btn.configure(relief="sunken", bd=4)
            else:
                btn.configure(relief="raised", bd=2)

            btn.configure(bg=bg, fg=fg, activebackground=bg)

        self.update_pin_table()

    def update_pin_table(self):
        for i in range(NUM_PINS):
            role_code = self.pin_roles[i]
            level = self.pin_levels[i]
            role_name = ROLE_NAMES.get(role_code, "UNUSED")
            self.pin_table.item(str(i), values=(i, role_name, level))

    # ---------- Event processing ----------

    def process_events(self):
        try:
            while True:
                item = self.event_queue.get_nowait()
                kind = item[0]

                if kind == "ack":
                    _, ref_cmd, status = item
                    msg = {
                        0x00: "OK",
                        0x01: "BAD_PIN",
                        0x02: "BAD_ROLE",
                        0x03: "NOT_OUTPUT",
                        0x04: "BAD_ARGS",
                        0xFF: "UNKNOWN_CMD",
                    }.get(status, f"0x{status:02X}")
                    self.log(f"[ACK] refCmd=0x{ref_cmd:02X}, status={msg}")

                elif kind == "status":
                    _, payload = item
                    self._handle_status_frame(payload)

                elif kind == "sync":
                    _, payload = item
                    self._handle_sync_dump(payload)

                elif kind == "unknown":
                    _, cmd, payload = item
                    self.log(f"[RX] Unknown CMD=0x{cmd:02X}, payload={payload.hex()}")

        except queue.Empty:
            pass

        self.root.after(50, self.process_events)

    def _handle_status_frame(self, payload):
        if len(payload) < 1:
            self.log("[RX] STATUS_FRAME too short.")
            return
        time_low = payload[0]
        per_pins = payload[1:]
        if len(per_pins) != NUM_PINS:
            self.log(f"[RX] STATUS_FRAME pin count mismatch: {len(per_pins)}")
            return

        for i, b in enumerate(per_pins):
            # remote_role = b & 0x0F   # IGNORED – GUI is master
            remote_level = (b >> 4) & 0x01

            if self.pending_level[i] is not None:
                self.pin_levels[i] = self.pending_level[i]
                if remote_level == self.pending_level[i]:
                    self.pending_level[i] = None
            else:
                self.pin_levels[i] = remote_level

        self.level_var.set(self.pin_levels[self.selected_pin])
        self.update_pin_visuals()
        self.log(f"[STATUS] time_low8={time_low}")

    def _handle_sync_dump(self, payload):
        if len(payload) < 1:
            self.log("[RX] SYNC_DUMP too short.")
            return
        num_pins = payload[0]
        expected_len = 1 + num_pins * 2
        if len(payload) != expected_len or num_pins != NUM_PINS:
            self.log(
                f"[RX] SYNC_DUMP length mismatch: got {len(payload)}, expected {expected_len} for {NUM_PINS} pins"
            )
            return

        # SYNC = explicit “trust device”
        self.pending_level = [None] * NUM_PINS

        for i in range(num_pins):
            role_code = payload[1 + 2 * i]
            level = payload[1 + 2 * i + 1]
            self.pin_roles[i] = role_code
            self.pin_levels[i] = 1 if level else 0

        self.role_var.set(ROLE_NAMES.get(self.pin_roles[self.selected_pin], "UNUSED"))
        self.level_var.set(self.pin_levels[self.selected_pin])

        self.update_pin_visuals()
        self.log("[SYNC] Config updated from device")


# ================= MAIN ================================

def main():
    root = tk.Tk()
    app = ICNodeGUI(root)
    root.mainloop()


if __name__ == "__main__":
    main()
