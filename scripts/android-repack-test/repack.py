"""Replace one stripped QA library without changing Android's APK loading contract.

No build, emulator, installation or production signing is performed. Signing passwords are
read only by apksigner from the named environment variables. Run --self-test offline.
"""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import tempfile
import zipfile

NATIVE = "lib/arm64-v8a/libyonder_desktop_lib.so"
CHUNK = 1024 * 1024


def digest_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(CHUNK), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_at(stream, offset, size):
    stream.seek(offset)
    data = stream.read(size)
    if len(data) != size:
        raise ValueError("truncated ELF or ZIP entry")
    return data


def data_offset(archive, entry):
    header = read_at(archive.fp, entry.header_offset, 30)
    if header[:4] != b"PK\x03\x04":
        raise ValueError("invalid ZIP local header")
    name_size, extra_size = struct.unpack_from("<HH", header, 26)
    return entry.header_offset + 30 + name_size + extra_size


def elf_info(reader):
    header = struct.unpack("<16sHHIQQQIHHHHHH", reader(0, 64))
    if header[0][:6] != b"\x7fELF\x02\x01":
        raise ValueError("expected little-endian ELF64")
    loads = []
    for index in range(header[10]):
        program = struct.unpack("<IIQQQQQQ", reader(header[5] + index * header[9], 56))
        if program[0] == 1:
            loads.append(program)
    if not loads:
        raise ValueError("ELF contains no loadable segments")
    sections = [
        struct.unpack("<IIQQQQIIQQ", reader(header[6] + index * header[11], 64))
        for index in range(header[12])
    ]
    allocated = hashlib.sha256()
    if sections:
        names_section = sections[header[13]]
        names = reader(names_section[4], names_section[5])
        for section in sections:
            if not section[2] & 2:  # SHF_ALLOC; debug/symbol-only sections are intentionally removed.
                continue
            name = names[section[0]:].split(b"\0", 1)[0]
            allocated.update(name)
            allocated.update(struct.pack("<QQQQ", section[1], section[2], section[5], section[8]))
            if section[1] != 8:  # SHT_NOBITS has no file payload.
                for offset in range(0, section[5], CHUNK):
                    allocated.update(reader(section[4] + offset, min(CHUNK, section[5] - offset)))
    return {
        "machine": header[2],
        "loads": loads,
        "allocated_sha256": allocated.hexdigest(),
        "allocated_sections": sum(bool(section[2] & 2) for section in sections),
        "supports_16k": all(load[7] >= 16384 and (load[2] - load[3]) % 16384 == 0 for load in loads),
    }


def signature_entry(name):
    upper = name.upper()
    return upper.startswith("META-INF/") and (
        upper.endswith((".RSA", ".DSA", ".EC", ".SF")) or upper == "META-INF/MANIFEST.MF"
    )


def rewrite(source, output, native, stripped):
    with zipfile.ZipFile(source) as original, zipfile.ZipFile(output, "w") as changed:
        changed.comment = original.comment
        if native not in original.namelist():
            raise ValueError("target native library is missing from source APK")
        for entry in original.infolist():
            if signature_entry(entry.filename):
                continue
            metadata = copy.copy(entry)
            if entry.filename.startswith("lib/") and entry.filename.endswith(".so"):
                metadata.compress_type = zipfile.ZIP_STORED
            with changed.open(metadata, "w") as destination:
                if entry.filename == native:
                    with stripped.open("rb") as replacement:
                        shutil.copyfileobj(replacement, destination, CHUNK)
                else:
                    with original.open(entry) as content:
                        shutil.copyfileobj(content, destination, CHUNK)


def web_digest(archive):
    digest = hashlib.sha256()
    names = sorted(entry.filename for entry in archive.infolist() if entry.filename.startswith("assets/") and not entry.is_dir())
    if not names:
        return None  # Tauri can embed Web assets in the native ELF's allocated sections.
    for name in names:
        digest.update(name.encode())
        with archive.open(name) as content:
            for chunk in iter(lambda: content.read(CHUNK), b""):
                digest.update(chunk)
    return digest.hexdigest()


def tool(arguments, env=None):
    result = subprocess.run(arguments, env=env, capture_output=True, text=True)
    if result.returncode:
        # Never echo signing command arguments, environment or raw tool diagnostics.
        raise RuntimeError(Path(arguments[0]).name + " failed, exit " + str(result.returncode))
    return result.stdout


def signer_digest(apksigner, path):
    output = tool([str(apksigner), "verify", "--print-certs", str(path)])
    fingerprints = {value.lower() for value in re.findall(r"certificate SHA-256 digest: ([a-fA-F0-9]{64})", output)}
    if len(fingerprints) != 1:
        raise ValueError("expected exactly one debug signing certificate")
    return next(iter(fingerprints))


def fingerprint(path):
    status = path.stat()
    return status.st_ino, status.st_size, status.st_mtime_ns


def repack(args):
    source, stripped, output = map(lambda value: Path(value).resolve(), [args.source, args.stripped, args.output])
    if source == output or output.exists():
        raise ValueError("use a new output APK path")
    for name in [args.store_password_env, args.key_password_env]:
        if not os.environ.get(name):
            raise ValueError("required signing-password environment variable is missing: " + name)
    initial = fingerprint(source)
    initial_stripped = fingerprint(stripped)
    stripped_sha = digest_file(stripped)
    build_tools = Path(args.build_tools).resolve()
    apksigner, zipalign = build_tools / "apksigner", build_tools / "zipalign"
    with zipfile.ZipFile(source) as archive, stripped.open("rb") as library:
        entry = archive.getinfo(args.native)
        if entry.compress_type != zipfile.ZIP_STORED:
            raise ValueError("original native library must be STORED for direct ELF verification")
        start = data_offset(archive, entry)
        before = elf_info(lambda offset, size: read_at(archive.fp, start + offset, size))
        after = elf_info(lambda offset, size: read_at(library, offset, size))
        if before["machine"] != 183:
            raise ValueError("expected an AArch64 native library")
        if not before["allocated_sections"] or not after["allocated_sections"]:
            raise ValueError("ELF has no allocated sections to verify")
        if any(before[key] != after[key] for key in ["machine", "loads", "allocated_sha256"]):
            raise ValueError("stripped library differs in runtime ELF headers or allocated section contents")
        original_manifest = hashlib.sha256(archive.read("AndroidManifest.xml")).hexdigest()
        original_assets = web_digest(archive)
        methods = {entry.filename: entry.compress_type for entry in archive.infolist() if not signature_entry(entry.filename)}
    original_certificate = signer_digest(apksigner, source)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="qa-apk-", dir=output.parent) as temporary:
        temporary = Path(temporary)
        unsigned, aligned, signed = [temporary / name for name in ["unsigned.apk", "aligned.apk", "signed.apk"]]
        rewrite(source, unsigned, args.native, stripped)
        tool([str(zipalign), "-P", "16", "-f", "4", str(unsigned), str(aligned)])
        tool([str(apksigner), "sign", "--ks", args.keystore, "--ks-key-alias", args.alias,
              "--ks-pass", "env:" + args.store_password_env, "--key-pass", "env:" + args.key_password_env,
              "--v4-signing-enabled", "false", "--out", str(signed), str(aligned)])
        certificate = signer_digest(apksigner, signed)
        if certificate != original_certificate:
            raise ValueError("re-signed APK does not use the original debug certificate")
        tool([str(zipalign), "-c", "-P", "16", "4", str(signed)])
        with zipfile.ZipFile(signed) as archive:
            native_sha = hashlib.sha256()
            with archive.open(args.native) as content:
                for chunk in iter(lambda: content.read(CHUNK), b""):
                    native_sha.update(chunk)
            if native_sha.hexdigest() != stripped_sha:
                raise ValueError("signed APK native payload differs from the verified stripped library")
            if hashlib.sha256(archive.read("AndroidManifest.xml")).hexdigest() != original_manifest:
                raise ValueError("Android manifest changed")
            if web_digest(archive) != original_assets:
                raise ValueError("bundled Web assets changed")
            for name, method in methods.items():
                entry = archive.getinfo(name)
                native = name.startswith("lib/") and name.endswith(".so")
                if entry.compress_type != (zipfile.ZIP_STORED if native else method):
                    raise ValueError("ZIP compression method changed unexpectedly")
                if native and data_offset(archive, entry) % 16384:
                    raise ValueError("native library is not aligned to a 16KiB APK boundary")
        if fingerprint(source) != initial or fingerprint(stripped) != initial_stripped:
            raise ValueError("APK or stripped library changed during repacking")
        source_sha = digest_file(source)
        if fingerprint(source) != initial or fingerprint(stripped) != initial_stripped:
            raise ValueError("APK or stripped library changed during hashing")
        report = {
            "source_sha256": source_sha, "source_size": initial[1],
            "stripped_sha256": stripped_sha, "stripped_size": initial_stripped[1],
            "apk_sha256": digest_file(signed), "apk_size": signed.stat().st_size,
            "signer_sha256": certificate, "manifest_sha256": original_manifest, "web_assets_sha256": original_assets,
            "native_allocated_sha256": after["allocated_sha256"],
            "same_debug_certificate": True, "zipalign_16k": True, "runtime_elf_unchanged": True,
            "native_payload_unchanged": True,
            "elf_supports_16k": after["supports_16k"], "web_assets_unchanged": True,
        }
        os.replace(signed, output)
        output.chmod(0o600)
    if args.report:
        Path(args.report).write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))


def self_test():
    names = b"\0.text\0.shstrtab\0"
    header = struct.pack("<16sHHIQQQIHHHHHH", b"\x7fELF\x02\x01\x01" + bytes(9),
                         3, 183, 1, 0, 64, 128, 0, 64, 56, 1, 64, 3, 2)
    program = struct.pack("<IIQQQQQQ", 1, 5, 0, 0, 0, 324 + len(names), 324 + len(names), 16384)
    text = struct.pack("<IIQQQQIIQQ", 1, 1, 6, 0, 320, 4, 0, 0, 4, 0)
    strings = struct.pack("<IIQQQQIIQQ", 7, 3, 0, 0, 324, len(names), 0, 0, 1, 0)
    image = bytearray(header + program + bytes(8) + bytes(64) + text + strings + b"live" + names)
    elf = elf_info(lambda offset, size: image[offset:offset + size])
    assert elf["machine"] == 183 and elf["supports_16k"] and elf["allocated_sections"] == 1
    image[320] ^= 1
    assert elf_info(lambda offset, size: image[offset:offset + size])["allocated_sha256"] != elf["allocated_sha256"]
    struct.pack_into("<Q", image, 64 + 48, 4096)
    assert not elf_info(lambda offset, size: image[offset:offset + size])["supports_16k"]
    with tempfile.TemporaryDirectory() as temporary:
        temporary = Path(temporary)
        source, output, library = [temporary / name for name in ["source.apk", "output.apk", "stripped.so"]]
        library.write_bytes(b"stripped-native")
        with zipfile.ZipFile(source, "w") as archive:
            for name, content, method in [
                (NATIVE, b"debug-native", zipfile.ZIP_STORED),
                ("assets/index.html", b"unchanged-web", zipfile.ZIP_DEFLATED),
                ("resources.arsc", b"resource", zipfile.ZIP_STORED),
                ("META-INF/OLD.RSA", b"old-signature", zipfile.ZIP_STORED),
            ]:
                metadata = zipfile.ZipInfo(name, date_time=(2026, 11, 15, 1, 2, 4))
                metadata.compress_type = method
                archive.writestr(metadata, content)
        rewrite(source, output, NATIVE, library)
        with zipfile.ZipFile(source) as original, zipfile.ZipFile(output) as archive:
            assert archive.getinfo(NATIVE).compress_type == zipfile.ZIP_STORED
            assert archive.read(NATIVE) == library.read_bytes()
            assert archive.getinfo("assets/index.html").compress_type == zipfile.ZIP_DEFLATED
            assert archive.getinfo("resources.arsc").compress_type == zipfile.ZIP_STORED
            assert archive.getinfo(NATIVE).date_time == original.getinfo(NATIVE).date_time
            assert web_digest(original) == web_digest(archive)
            assert "META-INF/OLD.RSA" not in archive.namelist()
    print(json.dumps({"self_test": True}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--source")
    parser.add_argument("--stripped")
    parser.add_argument("--output")
    parser.add_argument("--native", default=NATIVE)
    parser.add_argument("--build-tools", default=str(Path.home() / "Library/Android/sdk/build-tools/37.0.0"))
    parser.add_argument("--keystore", default=str(Path.home() / ".android/debug.keystore"))
    parser.add_argument("--alias", default="androiddebugkey")
    parser.add_argument("--store-password-env", default="ANDROID_DEBUG_STORE_PASSWORD")
    parser.add_argument("--key-password-env", default="ANDROID_DEBUG_KEY_PASSWORD")
    parser.add_argument("--report")
    options = parser.parse_args()
    if options.self_test:
        self_test()
    else:
        if not all([options.source, options.stripped, options.output]):
            parser.error("--source, --stripped and --output are required")
        repack(options)
