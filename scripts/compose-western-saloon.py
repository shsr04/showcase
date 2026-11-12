#!/usr/bin/env python3
"""Note: render the original saloon piano loop to a WAV.
Note: needs the fluidsynth shared library and a General MIDI soundfont, by default /usr/share/sounds/sf2/TimGM6mb.sf2.
Note: run `python3 scripts/compose-western-saloon.py /tmp/saloon.wav [soundfont]`.
Note: make the shipped MP3 with `ffmpeg -y -i /tmp/saloon.wav -c:a libmp3lame -b:a 128k -ar 44100 -ac 2 public/western/audio/saloon-piano.mp3`.
"""
import ctypes as c
import ctypes.util
import math
import struct
import sys
import wave

if len(sys.argv) < 2:
    raise SystemExit('Pass an output WAV path')
font = sys.argv[2] if len(sys.argv) > 2 else '/usr/share/sounds/sf2/TimGM6mb.sf2'
f = c.CDLL(ctypes.util.find_library('fluidsynth'))
def api(name, result, *args):
    fn = getattr(f, name)
    fn.restype, fn.argtypes = result, args
    return fn
ptr, integer, double, string = c.c_void_p, c.c_int, c.c_double, c.c_char_p
settings = api('new_fluid_settings', ptr)()
api('fluid_settings_setnum', integer, ptr, string, double)(settings, b'synth.sample-rate', 44100.0)
api('fluid_settings_setnum', integer, ptr, string, double)(settings, b'synth.gain', 0.8)
api('fluid_settings_setint', integer, ptr, string, integer)(settings, b'synth.reverb.active', 0)
api('fluid_settings_setint', integer, ptr, string, integer)(settings, b'synth.chorus.active', 0)
synth = api('new_fluid_synth', ptr, ptr)(settings)
if api('fluid_synth_sfload', integer, ptr, string, integer)(synth, font.encode(), 1) < 0:
    raise SystemExit('Could not load the soundfont')
program = api('fluid_synth_program_change', integer, ptr, integer, integer)
program(synth, 0, 3)  # Note: GM honky-tonk piano.
program(synth, 1, 32) # Note: GM acoustic bass.
noteon = api('fluid_synth_noteon', integer, ptr, integer, integer, integer)
noteoff = api('fluid_synth_noteoff', integer, ptr, integer, integer)
write = api('fluid_synth_write_float', integer, ptr, integer, ptr, integer, integer, ptr, integer, integer)

rate, beat = 44100, 60 / 112
chords = [(48, [60,64,67]), (48, [60,64,67]), (53, [60,65,69]), (53, [60,65,69]),
          (48, [60,64,67]), (48, [60,64,67]), (43, [59,62,67]), (43, [59,62,67]),
          (48, [60,64,67]), (48, [60,64,67]), (53, [60,65,69]), (53, [60,65,69]),
          (48, [60,64,67]), (43, [59,62,67]), (48, [60,64,67]), (43, [59,62,67])]
# Note: each phrase has eight eighth notes; the rests and short pickups give the tune a ragtime lilt.
melodies = [
 [76,79,81,79,76,74,72,None], [76,79,81,84,81,79,76,None],
 [77,81,84,81,77,76,74,None], [72,74,76,77,79,81,77,None],
 [76,79,81,79,76,74,72,74], [76,72,76,79,81,79,76,None],
 [74,77,79,77,74,71,67,None], [71,74,77,79,77,74,71,None],
 [72,76,79,81,84,81,79,None], [76,79,81,79,76,74,72,None],
 [77,81,84,81,77,76,74,None], [72,74,76,77,79,81,77,None],
 [76,79,81,79,76,74,72,74], [71,74,77,79,77,74,71,None],
 [72,76,79,76,72,76,79,84], [83,79,77,74,71,74,79,None],
]
events = []
def note(channel, pitch, start, duration, velocity):
    events.append((round(start * rate), True, channel, pitch, velocity))
    events.append((round((start + duration) * rate), False, channel, pitch, 0))
for bar, (root, chord) in enumerate(chords):
    base = bar * 4 * beat
    for b in range(4):
        note(1, root - 12 + (7 if b % 2 else 0), base + b * beat, beat * 0.7, 82)
        for pitch in chord:
            note(0, pitch, base + (b + 0.5) * beat, beat * 0.38, 48)
    for n, pitch in enumerate(melodies[bar]):
        if pitch is not None:
            # Note: alternating long and short eighths suggests a gently swung player piano.
            offset = (n // 2 + (0.58 if n % 2 else 0)) * beat
            note(0, pitch, base + offset, beat * (0.37 if n % 2 else 0.5), 73 + (n % 3) * 4)
events.sort(key=lambda e: (e[0], e[1]))
length = round(len(chords) * 4 * beat * rate)
left = (c.c_float * length)()
right = (c.c_float * length)()
pos = 0
for frame, on, channel, pitch, velocity in events:
    frame = min(frame, length)
    if frame > pos:
        write(synth, frame - pos, left, pos, 1, right, pos, 1)
        pos = frame
    (noteon(synth, channel, pitch, velocity) if on else noteoff(synth, channel, pitch))
if pos < length:
    write(synth, length - pos, left, pos, 1, right, pos, 1)
with wave.open(sys.argv[1], 'wb') as out:
    out.setparams((2, 2, rate, length, 'NONE', 'not compressed'))
    data = bytearray(length * 4)
    for i in range(length):
        fade = min(1, i / (0.12 * rate), (length - 1 - i) / (0.3 * rate))
        struct.pack_into('<hh', data, i * 4, *(round(max(-1, min(1, channel[i] * fade)) * 32767) for channel in (left, right)))
    out.writeframes(data)
api('delete_fluid_synth', None, ptr)(synth)
api('delete_fluid_settings', None, ptr)(settings)
