#!/usr/bin/env python3
"""Voice-over for the promo: one radio host reading promo/script.json (edge-tts neural voices), joined per scene
with a short gap and given a radio sound (band-limited, compressed, a little room). Writes promo/vo/<scene>.wav."""
import json, subprocess, tempfile, time
from pathlib import Path

DIR = Path(__file__).parent
VOICES = {'A': ('en-US-GuyNeural', '+10%', '+0Hz')}
RADIO = 'highpass=f=160,lowpass=f=7000,equalizer=f=2800:t=q:w=1:g=3,acompressor=threshold=-22dB:ratio=4:attack=5:release=90:makeup=5,aecho=0.8:0.4:35:0.08'
(DIR / 'vo').mkdir(exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
    for s in json.loads((DIR / 'script.json').read_text()):
        parts = []
        for i, (who, text) in enumerate(s['lines']):
            v, rate, pitch = VOICES[who]
            mp3 = f'{tmp}/{s["id"]}-{i}.mp3'
            for attempt in range(5):  # the service drops a request now and then
                if subprocess.run(['edge-tts', '--voice', v, f'--rate={rate}', f'--pitch={pitch}', '--text', text, '--write-media', mp3], capture_output=True).returncode == 0:
                    break
                time.sleep(2)
            else:
                raise SystemExit(f'edge-tts failed: {text}')
            parts.append(mp3)
        ins = sum([['-i', p] for p in parts], [])
        chain = ''.join(f'[{i}]aresample=44100,apad=pad_dur=0.18[p{i}];' for i in range(len(parts)))
        cat = ''.join(f'[p{i}]' for i in range(len(parts))) + f'concat=n={len(parts)}:v=0:a=1,{RADIO}[a]'
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *ins, '-filter_complex', chain + cat, '-map', '[a]', '-ac', '2', str(DIR / 'vo' / f'{s["id"]}.wav')], check=True)
        print(s['id'])
