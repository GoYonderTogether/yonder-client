#!/usr/bin/env python3
"""Real hidden native recorder acceptance. No fake microphone, screen input or TCC changes."""
import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import platform
import queue
import subprocess
import tempfile
import threading
import time
import wave
from datetime import datetime, timezone


class Native:
    def __init__(self, binary, root, transcript):
        import os
        self.process = subprocess.Popen([str(binary)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=subprocess.PIPE, text=True,
                                        env={**os.environ, "NATIVE_MEETING_TEST_ROOT": str(root)})
        self.responses = queue.Queue()
        self.errors = []
        self.transcript = transcript
        self.sequence = 0
        threading.Thread(target=self._stdout, daemon=True).start()
        threading.Thread(target=self._stderr, daemon=True).start()

    def _stdout(self):
        for line in self.process.stdout:
            try:
                value = json.loads(line)
            except ValueError:
                self.transcript.append({"nativeLog": line.rstrip()})
                continue
            redacted = json.loads(json.dumps(value))
            if isinstance(redacted.get("value"), dict):
                redacted["value"].pop("base64", None)
            self.transcript.append({"response": redacted})
            self.responses.put(value)

    def _stderr(self):
        for line in self.process.stderr:
            self.errors.append(line.rstrip())

    def receive(self, predicate, timeout=50):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                value = self.responses.get(timeout=min(1, deadline - time.monotonic()))
                if predicate(value):
                    return value
            except queue.Empty:
                if self.process.poll() is not None:
                    raise RuntimeError(f"native process exited {self.process.returncode}: {'; '.join(self.errors[-4:])}")
        raise TimeoutError("native response timed out")

    def ready(self):
        # A cold hidden WKWebView can start slowly on this shared QA machine.
        result = self.receive(lambda value: "ready" in value, timeout=120)
        assert result.get("ready") is True, result

    def command(self, op, source=None, expect_error=False, private=False):
        self.sequence += 1
        request = {"id": str(self.sequence), "op": op}
        if source is not None:
            request["source"] = source
        logged_request = dict(request)
        if private or (source and "configure_upload" in source):
            logged_request["source"] = "[private upload configuration]"
        self.transcript.append({"request": logged_request})
        self.process.stdin.write(json.dumps(request, ensure_ascii=False) + "\n")
        self.process.stdin.flush()
        value = self.receive(lambda item: item.get("id") == request["id"])
        if expect_error:
            assert value.get("ok") is False, value
            return value.get("error", "")
        assert value.get("ok") is True, value
        return value.get("value")

    def invoke(self, command, arguments, expect_error=False):
        return self.command("eval", "window.__TAURI_INTERNALS__.invoke(" +
                            json.dumps("plugin:meeting-recorder|" + command) + "," +
                            json.dumps(arguments) + ")", expect_error, private=command == "configure_upload")

    def saved(self, owner, recording_id, after_ms=0):
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            state = self.invoke("get_state", {"ownerId": owner})
            assert state["activeId"] == recording_id, state
            item = next(item for item in state["recordings"] if item["id"] == recording_id)
            if item["savedDurationMs"] > after_ms:
                return item
            time.sleep(0.25)
        raise TimeoutError("no new persistent audio segment")

    def audio(self, owner, recording_id, path):
        arguments = {"ownerId": owner, "recordingId": recording_id, "segmentIndex": 0}
        source = """(async()=>{const result=await window.__TAURI_INTERNALS__.invoke(
            'plugin:meeting-recorder|read_audio',ARGS);const bytes=new Uint8Array(result);
            let raw='';for(let i=0;i<bytes.length;i+=32768)
            raw+=String.fromCharCode(...bytes.subarray(i,i+32768));
            return {byteLength:bytes.length,base64:btoa(raw)};})()""".replace("ARGS", json.dumps(arguments))
        result = self.command("eval", source)
        data = base64.b64decode(result["base64"], validate=True)
        assert data[:4] == b"RIFF" and len(data) == result["byteLength"], "read_audio was not a binary WAV"
        with wave.open(io.BytesIO(data)) as audio:
            details = {"channels": audio.getnchannels(), "sampleRate": audio.getframerate(),
                       "frames": audio.getnframes(), "sampleWidth": audio.getsampwidth()}
            assert details["frames"] > 0 and details["sampleWidth"] == 2, details
            audio.readframes(details["frames"])
        path.write_bytes(data)
        return {**details, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(), "path": str(path)}

    def kill(self):
        self.process.kill()
        self.process.wait(timeout=10)

    def close(self):
        if self.process.poll() is None:
            try:
                self.process.stdin.write('{"op":"quit"}\n')
                self.process.stdin.flush()
                self.process.wait(timeout=10)
            except (OSError, subprocess.TimeoutExpired):
                self.kill()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--binary", required=True, type=Path)
    parser.add_argument("--root", required=True, type=Path, help="private parent for a fresh acceptance directory")
    args = parser.parse_args()
    args.root.mkdir(parents=True, exist_ok=True)
    root = Path(tempfile.mkdtemp(prefix="native-meeting-", dir=args.root))
    binary = args.binary.resolve(strict=True)
    transcript, checks, processes = [], [], []
    report = {"createdAt": datetime.now(timezone.utc).isoformat(), "platform": platform.platform(),
              "root": str(root), "binary": str(binary), "binarySha256": hashlib.sha256(binary.read_bytes()).hexdigest(),
              "input": "real default microphone; no synthetic fallback", "checks": checks,
              "notTested": ["physical power loss", "host sleep/lock", "two-hour recording", "other operating systems"]}
    owner, current = "qa_native", "startup"

    def passed(name, evidence=None):
        checks.append({"name": name, "status": "passed", "evidence": evidence})

    try:
        native = Native(binary, root, transcript)
        processes.append(native)
        native.ready()
        hidden = native.command("inspect")
        assert hidden and hidden["visible"] is False and hidden["focused"] is False, hidden
        passed("hidden_ready", hidden)
        current = "activate_owner"
        state = native.invoke("set_owner", {"ownerId": owner})
        assert state["activeId"] is None and state["recordings"] == [], state
        passed(current)
        current = "microphone_start"
        state = native.invoke("start", {"ownerId": owner, "title": "Real native microphone acceptance"})
        first = state["activeId"]
        assert first, state
        passed(current, {"id": first})
        current = "first_segment_saved"
        item = native.saved(owner, first)
        before = item["savedDurationMs"]
        passed(current, {"savedDurationMs": before})
        current = "closed_window_background_saved"
        native.command("close")
        item = native.saved(owner, first, before)
        hidden = native.command("inspect")
        assert hidden and hidden["visible"] is False and hidden["focused"] is False, hidden
        passed(current, {"savedDurationMs": item["savedDurationMs"], "window": hidden})
        current = "read_audio_wav"
        passed(current, native.audio(owner, first, root / "before-stop.wav"))
        current = "stopped_recording"
        state = native.invoke("stop", {"ownerId": owner, "recordingId": first})
        item = next(item for item in state["recordings"] if item["id"] == first)
        assert state["activeId"] is None and item["state"] == "ended", state
        passed(current, {"savedDurationMs": item["savedDurationMs"]})
        current = "account_isolation"
        switched = native.invoke("start", {"ownerId": owner, "title": "Account switch stops recording"})
        switch_id = switched["activeId"]
        assert switch_id, switched
        native.saved(owner, switch_id)
        state = native.invoke("set_owner", {"ownerId": "qa_other"})
        assert state["recordings"] == [] and state["activeId"] is None, state
        indicator = native.command("inspect")
        assert indicator["trayRecording"] is False, indicator
        error = native.invoke("get_state", {"ownerId": owner}, expect_error=True)
        assert "meeting_owner_mismatch" in error, error
        original_state = native.invoke("set_owner", {"ownerId": owner})
        assert next(item for item in original_state["recordings"] if item["id"] == switch_id)["state"] == "ended"
        passed(current)
        current = "second_recording_new_id"
        state = native.invoke("start", {"ownerId": owner, "title": "Interrupt recovery acceptance"})
        second = state["activeId"]
        assert second and second != first, state
        passed(current, {"id": second})
        current = "second_segment_saved"
        item = native.saved(owner, second)
        saved = item["savedDurationMs"]
        passed(current, {"savedDurationMs": saved})
        current = "forced_process_termination"
        native.kill()
        passed(current, {"exitCode": native.process.returncode})
        current = "recovery_interrupted_no_resume"
        native = Native(binary, root, transcript)
        processes.append(native)
        native.ready()
        state = native.invoke("set_owner", {"ownerId": owner})
        recovered = next(item for item in state["recordings"] if item["id"] == second)
        original = next(item for item in state["recordings"] if item["id"] == first)
        assert state["activeId"] is None and recovered["state"] == "interrupted", state
        assert recovered["savedDurationMs"] >= saved and original["state"] == "ended", state
        passed(current, {"savedDurationMs": recovered["savedDurationMs"], "id": second})
        current = "recovered_wav_readable"
        passed(current, native.audio(owner, second, root / "after-recovery.wav"))
    except Exception as error:
        checks.append({"name": current, "status": "failed", "error": repr(error)})
    finally:
        for native in processes:
            native.close()
        report["stderr"] = [line for native in processes for line in native.errors]
        report["counts"] = {"passed": sum(check["status"] == "passed" for check in checks),
                            "failed": sum(check["status"] == "failed" for check in checks),
                            "cancelled": 0, "skipped": 13 - len(checks)}
        (root / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        (root / "transcript.json").write_text(json.dumps(transcript, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"report": str(root / "report.json"), "counts": report["counts"]}))
    return 1 if report["counts"]["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
