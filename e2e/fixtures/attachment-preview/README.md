# Real attachment fixtures

- `document.docx`: LibreOffice conversion of the local test source containing Chinese/English paragraphs, table and embedded PNG. Same source as the private server's attachment preview parser fixture.
- `chinese.pdf`: three pages generated with ReportLab, subset embedded Arial Unicode Chinese text, genuine PDF text/canvas rendering test.
- `audio.wav`: FFmpeg-generated 1-second 440 Hz PCM sine, mono 16 kHz.
- `video.mp4`: FFmpeg-generated 2-second H.264/YUV420P blue clip, 12 fps / 24 real frames, no audio. Replaces the previous single-frame clip so playback time can advance in Chromium as well as testing the poster.
- `photo.heic`: upstream libheif demonstration file, https://github.com/strukturag/libheif/blob/master/examples/example.heic (retrieved 2026-11-15). Used solely as a genuine HEIC decoder test fixture, not a self-generated image. Upstream [COPYING](https://github.com/strukturag/libheif/blob/master/COPYING) declares LGPL-3.0 for libheif and MIT for sample applications/wrappers; copyright Struktur AG and Dirk Farin. The source does not state a separate photograph-specific license in this metadata.

These are isolated test media; none is substituted into product behavior.
