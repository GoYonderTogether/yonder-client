"""Exercise the native macOS updater in an isolated fixture, without opening a window.

Run from any directory: python3 scripts/desktop-updater-test/run.py
Requires the repository's installed Tauri CLI and cached Rust dependencies. This tests the
real updater with Tauri's MockRuntime; it does not test the web UI or Tauri process relaunch.
"""

import ctypes
import functools
import hashlib
import http.server
import json
import os
from pathlib import Path
import platform
import plistlib
import shutil
import stat
import subprocess
import tarfile
import tempfile
import threading

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
CLI = REPO / "apps/desktop/node_modules/.bin/tauri"


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def make_bundle(parent, version, binary):
    app = parent / "Fixture.app"
    (app / "Contents/MacOS").mkdir(parents=True)
    (app / "Contents/Resources").mkdir()
    shutil.copy2(binary, app / "Contents/MacOS/updater-test")
    (app / "Contents/Resources/version").write_text(version)
    with (app / "Contents/Info.plist").open("wb") as f:
        plistlib.dump(
            {
                "CFBundleIdentifier": "dev.yonder.updater-background-test",
                "CFBundleExecutable": "updater-test",
                "CFBundleName": "Yonder Updater Background Test",
                "CFBundlePackageType": "APPL",
                "CFBundleVersion": version,
                "CFBundleShortVersionString": version,
                "LSBackgroundOnly": True,
            },
            f,
        )
    return app


def check_swap(app, root):
    # Test the exact private installation path before calling an updater that can request
    # administrator authorization when a bundle cannot be moved.
    require(root.stat().st_uid == os.getuid(), "temporary directory is not owned by this user")
    require(stat.S_IMODE(root.stat().st_mode) == 0o700, "temporary directory is not private")
    require(app.stat().st_uid == os.getuid(), "fixture bundle is not owned by this user")
    require(os.access(root, os.W_OK) and os.access(app, os.W_OK), "fixture is not writable")
    probe = root / "swap-probe"
    probe.mkdir()
    libc = ctypes.CDLL(None, use_errno=True)
    renamex = libc.renamex_np
    renamex.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint]
    renamex.restype = ctypes.c_int
    for _ in range(2):
        if renamex(os.fsencode(app), os.fsencode(probe), 2) != 0:  # RENAME_SWAP
            raise OSError(ctypes.get_errno(), "fixture bundle swap preflight failed")
    probe.rmdir()


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


def main():
    require(platform.system() == "Darwin" and platform.machine() == "arm64", "requires macOS on Apple Silicon")
    require(CLI.is_file(), "install the repository's desktop dependencies first")
    env = os.environ.copy()
    for name in ("CARGO_TARGET_DIR", "TAURI_SIGNING_PRIVATE_KEY", "TAURI_SIGNING_PRIVATE_KEY_PATH", "TAURI_SIGNING_PRIVATE_KEY_PASSWORD"):
        env.pop(name, None)

    with tempfile.TemporaryDirectory(prefix="yonder-updater-bg.", dir="/private/tmp") as temp:
        root = Path(temp)
        shutil.copy2(HERE / "Cargo.toml", root / "Cargo.toml")
        shutil.copytree(HERE / "src", root / "src")
        shutil.copy2(REPO / "apps/desktop/src-tauri/Cargo.lock", root / "Cargo.lock")
        env["TMPDIR"] = str(root)
        for version in ("0.1.0", "0.2.0"):
            env["HARNESS_BUILD_VERSION"] = version
            subprocess.run(["cargo", "build", "--offline", "--quiet"], cwd=root, env=env, check=True)
            shutil.copy2(root / "target/debug/yonder-updater-background-test", root / (version + ".bin"))

        serve = root / "serve"
        serve.mkdir()
        old = make_bundle(root, "0.1.0", root / "0.1.0.bin")
        new = make_bundle(root / "payload", "0.2.0", root / "0.2.0.bin")
        archive = serve / "fixture.app.tar.gz"
        with tarfile.open(archive, "w:gz") as tar:
            tar.add(new, arcname="Fixture.app")

        # Signing output can contain the generated private key; never log it.
        subprocess.run([CLI, "signer", "generate", "--ci", "-w", root / "test.key", "-p", ""],
                       env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        subprocess.run([CLI, "signer", "sign", "-f", root / "test.key", "-p", "",
                        "--app-version", "0.2.0", archive],
                       env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        signature = Path(str(archive) + ".sig").read_text().strip()

        handler = functools.partial(QuietHandler, directory=serve)
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            url = f"http://127.0.0.1:{server.server_port}"
            (serve / "darwin.json").write_text(json.dumps({
                "version": "0.2.0",
                "platforms": {"darwin-aarch64": {"url": url + "/fixture.app.tar.gz", "signature": signature}},
            }))
            check_swap(old, root)
            executable = old / "Contents/MacOS/updater-test"
            command = [str(executable), str(root), url + "/darwin.json"]
            subprocess.run(command, cwd=root, env=env, timeout=90, check=True)
            with (old / "Contents/Info.plist").open("rb") as f:
                require(plistlib.load(f)["CFBundleShortVersionString"] == "0.2.0", "installed version mismatch")
            digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
            require(digest(executable) == digest(root / "0.2.0.bin") != digest(root / "0.1.0.bin"),
                    "installed executable mismatch")
            subprocess.run(command, cwd=root, env=env, timeout=30, check=True)
            print("Info.plist version 0.2.0 and replaced binary SHA-256 verified", flush=True)
            print("Tauri process relaunch was not invoked", flush=True)
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    main()
