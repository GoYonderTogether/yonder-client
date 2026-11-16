#!/usr/bin/env python3
"""Upload explicitly supplied synthetic QA audio through the real hidden native queue."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import tempfile
import time
import urllib.request
import uuid
import wave
from run import Native


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', required=True, type=Path)
    parser.add_argument('--root', required=True, type=Path)
    parser.add_argument('--auth', required=True, type=Path, help='private real QA session JSON; never copied or logged')
    parser.add_argument('--synthetic-segments', required=True, type=Path, help='explicitly synthetic QA WAV directory, not microphone recordings')
    args = parser.parse_args()
    auth = json.loads(args.auth.read_text())
    token = auth['accessToken']
    owner = auth['session']['me']['member']['id']
    conversation = auth['conversationId']
    origin = auth['origin'].rstrip('/')
    args.root.mkdir(parents=True, exist_ok=True)
    root = Path(tempfile.mkdtemp(prefix='native-meeting-upload-', dir=args.root))
    root.chmod(0o700)
    recording_id = 'r_m2_upload_' + uuid.uuid4().hex
    audio_root = root / 'recordings' / owner / recording_id
    audio_root.mkdir(parents=True, mode=0o700)
    (root / 'recordings').chmod(0o700)
    (root / 'recordings' / owner).chmod(0o700)
    parts, sources = [], sorted(args.synthetic_segments.glob('*.wav'))
    assert sources, 'No synthetic WAV segments supplied'
    rate, channels = None, None
    for index, source in enumerate(sources):
        with wave.open(str(source), 'rb') as audio:
            assert audio.getsampwidth() == 2 and audio.getcomptype() == 'NONE', 'PCM16 WAV required'
            current_rate, current_channels = audio.getframerate(), audio.getnchannels()
            rate, channels = rate or current_rate, channels or current_channels
            assert (rate, channels) == (current_rate, current_channels), 'Inconsistent source audio format'
            frames = audio.getnframes()
            samples = audio.readframes(frames)
        target = audio_root / f'{index:08}.wav'
        with wave.open(str(target), 'wb') as audio:
            audio.setnchannels(channels)
            audio.setsampwidth(2)
            audio.setframerate(rate)
            audio.writeframes(samples)
        target.chmod(0o600)
        parts.append({'index': index, 'durationMs': frames * 1000 // rate, 'byteLength': target.stat().st_size})
    duration = sum(part['durationMs'] for part in parts)
    ended = int(time.time() * 1000)
    manifest = {'id': recording_id, 'ownerId': owner, 'conversationId': conversation,
                'title': '合成中文 M2 原生上传验收', 'state': 'ended', 'startedAt': ended - duration,
                'endedAt': ended, 'durationMs': duration, 'savedDurationMs': duration,
                'sampleRate': rate, 'channels': channels, 'segments': parts, 'error': None}
    manifest_path = audio_root / 'recording.json'
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False))
    manifest_path.chmod(0o600)
    transcript, checks, processes = [], [], []
    report = {'input': 'Explicit synthetic QA WAV fixture imported into isolated native storage; no microphone opened',
              'root': str(root), 'binarySha256': hashlib.sha256(args.binary.read_bytes()).hexdigest(),
              'recordingId': recording_id, 'segments': len(parts), 'durationMs': duration, 'checks': checks,
              'notTested': ['real microphone upload', 'mobile background upload', 'physical power loss']}

    def passed(name):
        checks.append({'name': name, 'status': 'passed'})

    def api(path):
        request = urllib.request.Request(origin + path, headers={'Authorization': 'Bearer ' + token})
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.load(response)

    def open_native():
        native = Native(args.binary, root, transcript)
        processes.append(native)
        native.ready()
        state = native.invoke('set_owner', {'ownerId': owner})
        assert any(record['id'] == recording_id for record in state['recordings']), 'Synthetic fixture not visible to native recorder'
        native.invoke('configure_upload', {'ownerId': owner, 'baseUrl': origin, 'accessToken': token})
        return native

    try:
        native = open_native()
        hidden = native.command('inspect')
        assert hidden and hidden['visible'] is False and hidden['focused'] is False
        native.command('close')
        passed('hidden_window_closed_without_screen_input')
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            jobs = native.invoke('get_upload_jobs', {'ownerId': owner})
            job = next((job for job in jobs if job['recordingId'] == recording_id), None)
            if job and job['state'] == 'submitted':
                break
            if job and job['state'] in ('failed', 'authentication_required'):
                raise RuntimeError('native upload stopped: ' + str(job.get('errorCode')))
            time.sleep(0.5)
        else:
            raise TimeoutError('native queue did not submit within the bounded wait')
        meeting_id = job['meetingId']
        report['meetingId'] = meeting_id
        passed('native_background_queue_create_raw_wav_upload_and_process')
        persisted = json.loads((audio_root / 'upload.json').read_text())
        assert persisted['state'] == 'submitted' and persisted['meetingId'] == meeting_id
        assert token not in json.dumps(transcript)
        for path in root.rglob('*.json'):
            assert token.encode() not in path.read_bytes(), 'Credential found in native storage'
        passed('credentials_absent_from_transcript_and_native_storage')
        deadline = time.monotonic() + 180
        while time.monotonic() < deadline:
            meeting = api('/v1/meetings/' + meeting_id)
            if meeting['status'] == 'completed':
                break
            if meeting['status'] in ('failed', 'unknown'):
                raise RuntimeError('server processing stopped: ' + str(meeting.get('errorCode')))
            time.sleep(1)
        else:
            raise TimeoutError('server processing did not finish within the bounded wait')
        assert meeting['uploadedDurationMs'] == duration and all(part['uploaded'] for part in meeting['segments'])
        assert meeting['transcript'] and meeting['summary'] and meeting['summaryRunId'] and meeting['resultMessageId']
        report['summaryRunId'], report['resultMessageId'] = meeting['summaryRunId'], meeting['resultMessageId']
        passed('real_asr_summary_and_bot_result_available')
        native.close()
        reopened = open_native()
        time.sleep(5)
        jobs = reopened.invoke('get_upload_jobs', {'ownerId': owner})
        restored = next(job for job in jobs if job['recordingId'] == recording_id)
        assert restored['state'] == 'submitted' and restored['meetingId'] == meeting_id
        after = api('/v1/meetings/' + meeting_id)
        assert after['summaryRunId'] == meeting['summaryRunId'] and after['resultMessageId'] == meeting['resultMessageId']
        records = api('/v1/meetings?conversationId=' + conversation)['items']
        assert sum(item['clientRecordingId'] == recording_id for item in records) == 1
        passed('restart_preserves_submitted_job_and_same_result_identity')
        report['passed'] = True
    except Exception as error:
        report['passed'] = False
        report['error'] = type(error).__name__ + ': ' + str(error)
    finally:
        for process in processes:
            process.close()
        assert token not in json.dumps(transcript)
        for name, value in [('transcript.json', transcript), ('report.json', report)]:
            path = root / name
            path.write_text(json.dumps(value, ensure_ascii=False, indent=2))
            path.chmod(0o600)
    print(json.dumps({'passed': report['passed'], 'passedChecks': len(checks), 'report': str(root / 'report.json')}, ensure_ascii=False))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
