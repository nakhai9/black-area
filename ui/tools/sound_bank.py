# Generates the game's whole sound bank (new, from scratch) into ui/public/sounds/ as 16-bit mono WAV, and writes the
# list of files to ui/src/audio/soundBank.generated.ts (the game only fetches files on that list).
#
#   python tools/sound_bank.py            (run from ui/)
#
# Everything is synthesised from physical models of the real sources (numpy only, deterministic seeds):
#   - gunfire: supersonic N-wave crack + muzzle blast + action click + ground slap echo + outdoor reverb, one voice per
#     nation's rifle (M16/M4, AK-74, QBZ-95, HK416/FAMAS, AKM), in bursts at that rifle's cyclic rate;
#   - tank guns (120 mm / 125 mm), howitzer, rocket artillery, missiles, bombs, explosions;
#   - engines as seamless loops, one per machine: diesel firing harmonics by cylinder count, gas turbine (Abrams),
#     track links on the sprocket with metallic ring, tyres; helicopter rotors by blade count (Apache 4, Z-10 5, Ka-52
#     coaxial 3+3); jets by engine (turbofan roar + fan tones), turboprops by blade-pass, ships (shaft, cavitation, wash);
#   - footsteps per kind of soldier, boarding clunk, sea surf.
import os, re, wave, zlib
import numpy as np

SR = 22050
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'sounds')
LIST = os.path.join(HERE, '..', 'src', 'audio', 'soundBank.generated.ts')
written = []


# ------------------------------------------------------------------ helpers
def t_of(n):
    return np.arange(n) / SR


def spectral(x, gain_fn):
    """Filter in the frequency domain: gain_fn(freqs) -> gain per bin."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X * gain_fn(f), len(x))


def band(x, lo, hi, soft=1.4):
    def g(f):
        f = np.maximum(f, 1e-3)
        a = 1 / (1 + (lo / f) ** (2 * soft)) if lo > 0 else 1
        b = 1 / (1 + (f / hi) ** (2 * soft)) if hi > 0 else 1
        return a * b
    return spectral(x, g)


def lowpass(x, hi, soft=1.4):
    return band(x, 0, hi, soft)


def highpass(x, lo, soft=1.4):
    return band(x, lo, 0, soft)


def pink(n, rng):
    return spectral(rng.standard_normal(n), lambda f: 1 / np.sqrt(np.maximum(f, 20)))


def reverb(x, rt, wet, rng, bright=3000, slap=None):
    """Outdoor reverb: exponentially decaying filtered noise IR (+ an optional ground / wall slap echo)."""
    n = int(SR * rt * 1.2)
    ir = rng.standard_normal(n) * np.exp(-t_of(n) * 6.9 / rt)
    ir = lowpass(ir, bright)
    ir[: int(SR * 0.012)] *= np.linspace(0, 1, int(SR * 0.012))
    ir /= np.sqrt(np.sum(ir ** 2)) + 1e-9
    if slap:
        d, g = slap
        k = int(SR * d)
        if k < n:
            ir[k] += g
    m = len(x) + n
    y = np.fft.irfft(np.fft.rfft(x, m) * np.fft.rfft(ir, m), m)[: len(x)]
    return x + y * wet


def norm(x, peak=0.89):
    m = np.max(np.abs(x)) + 1e-9
    return x / m * peak


def soft_clip(x, drive=1.5):
    return np.tanh(x * drive) / np.tanh(drive)


def loopify(x, fade=0.3):
    """Seamless loop: the tail is cross-faded into the head."""
    k = int(SR * fade)
    head, body, tail = x[:k], x[k:-k], x[-k:]
    w = np.linspace(0, 1, k)
    return np.concatenate([tail * (1 - w) + head * w, body])


def qf(f, dur):
    """Frequency rounded to whole cycles over the loop (no click where it wraps)."""
    return max(1, round(f * dur)) / dur


# Real recordings (Freesound, see public/sounds/CREDITS.md) already in public/sounds: never overwritten by the synthesis.
REAL = {
    'bomb.wav',
    'engine-a-50.wav',
    'engine-a400m.wav',
    'engine-abrams.wav',
    'engine-ah-64-apache.wav',
    'engine-b-1a-lancer.wav',
    'engine-f-22.wav',
    'engine-h-6k.wav',
    'engine-hms-queen-elizabeth-r08.wav',
    'engine-humvee.wav',
    'engine-il-76.wav',
    'engine-j-31.wav',
    'engine-kamaz.wav',
    'engine-man-sv.wav',
    'engine-mtvr.wav',
    'engine-rafale.wav',
    'engine-su-35.wav',
    'engine-su-57.wav',
    'engine-tank.wav',
    'engine-truck.wav',
    'engine-tu-160.wav',
    'engine-type-004.wav',
    'engine-uss-enterprise-cvn-80.wav',
    'explosion.wav',
    'foot-demolition.wav',
    'foot-engineer.wav',
    'foot-regular.wav',
    'foot-special.wav',
    'foot-squatters.wav',
    'howitzer.wav',
    'mg-europe.wav',
    'mg-usa.wav',
    'rifle-china.wav',
    'rifle-europe.wav',
    'rifle-islamic.wav',
    'rifle-russia.wav',
    'rifle-usa.wav',
    'sea-waves.wav',
    'sniper-china.wav',
    'sniper-europe.wav',
    'sniper-islamic.wav',
    'sniper-russia.wav',
    'sniper-usa.wav',
    'tank-cannon-china.wav',
    'tank-cannon-europe.wav',
    'tank-cannon-islamic.wav',
    'tank-cannon-russia.wav',
    'tank-cannon-usa.wav',
}


def save(name, x):
    if name in REAL and os.path.exists(os.path.join(OUT, name)):
        written.append(name)
        return
    x = np.clip(x, -1, 1)
    path = os.path.join(OUT, name)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())
    written.append(name)


def slug(name):
    return re.sub(r'^-|-$', '', re.sub(r'[^a-z0-9]+', '-', name.lower()))


def place(dst, src, at):
    i = int(at * SR)
    j = min(len(dst), i + len(src))
    dst[i:j] += src[: j - i]


# ------------------------------------------------------------------ gunfire
# Rifle by nation: crack (bullet N-wave length, ms), blast (muzzle blast centre Hz), boom (low punch Hz), energy,
# cyclic (s between rounds), echo (slap echo delay, s), rt (reverb s).
GUNS = {
    'usa':     dict(crack=0.28, blast=900, boom=150, energy=0.85, cyclic=0.075, echo=0.18, rt=0.9),   # M16 / M4, 5.56
    'russia':  dict(crack=0.32, blast=620, boom=115, energy=1.0, cyclic=0.092, echo=0.22, rt=1.0),   # AK-74, 5.45
    'china':   dict(crack=0.30, blast=760, boom=130, energy=0.92, cyclic=0.083, echo=0.2, rt=0.95),  # QBZ-95, 5.8
    'europe':  dict(crack=0.27, blast=980, boom=155, energy=0.85, cyclic=0.062, echo=0.16, rt=0.85),  # HK416 / FAMAS
    'islamic': dict(crack=0.38, blast=520, boom=95, energy=1.15, cyclic=0.1, echo=0.3, rt=1.4),      # AKM, 7.62x39, desert
}
# Weapon size on top of the rifle: scale (blast / energy), rounds per burst, cyclic factor.
ARMS = {
    'rifle': dict(scale=1.0, rounds=(2, 4), cyc=1.0),
    'smg': dict(scale=0.7, rounds=(4, 6), cyc=0.8),
    'mg': dict(scale=1.35, rounds=(5, 8), cyc=1.15),
    'sniper': dict(scale=1.8, rounds=(1, 1), cyc=1.0),
}


def gunshot(g, scale, rng):
    n = int(SR * 0.35)
    t = t_of(n)
    x = np.zeros(n)
    # Supersonic crack: an N-wave (sharp rise, linear fall through zero, sharp return), a fraction of a millisecond.
    L = max(4, int(SR * g['crack'] / 1000 * (1 + 0.3 * (scale - 1))))
    nw = np.linspace(1, -1, L)
    x[2:2 + L] += nw * 0.9
    # Muzzle blast: broadband burst centred on `blast`, fast attack, decay by size.
    tau = 0.012 * scale ** 0.7
    blast = band(rng.standard_normal(n), g['blast'] * 0.35 / scale ** 0.3, g['blast'] * 4 / scale ** 0.3) * np.exp(-t / tau)
    x += blast * 1.3 * g['energy'] * scale
    # Low punch of the expanding gas (a short downward sweep).
    f = g['boom'] / scale ** 0.4 * (1 + 1.5 * np.exp(-t / 0.006))
    ph = 2 * np.pi * np.cumsum(f) / SR
    x += np.sin(ph) * np.exp(-t / (0.03 * scale)) * 0.55 * g['energy'] * scale
    # Bolt carrier cycling (metal click) a few ms later.
    k = int(SR * (0.006 + rng.uniform(0, 0.004)))
    click = band(rng.standard_normal(int(SR * 0.01)), 3500, 7000) * np.exp(-t_of(int(SR * 0.01)) / 0.002) * 0.12
    x[k:k + len(click)] += click
    return x


def gun_file(nation, arm):
    rng = np.random.default_rng(zlib.crc32(f"{nation}:{arm}".encode()))
    g, a = GUNS[nation], ARMS[arm]
    dur = 4.5 if arm != 'sniper' else 5.0
    out = np.zeros(int(SR * dur))
    at = 0.05
    while at < dur - 1.4:
        rounds = rng.integers(a['rounds'][0], a['rounds'][1] + 1)
        for r in range(rounds):
            place(out, gunshot(g, a['scale'], rng) * (1 - 0.06 * r) * rng.uniform(0.9, 1.05), at + r * g['cyclic'] * a['cyc'] * rng.uniform(0.95, 1.05))
        at += rounds * g['cyclic'] * a['cyc'] + (1.3 if arm != 'sniper' else 1.7)
    out = reverb(out, g['rt'] * (1.3 if arm == 'sniper' else 1), 0.35, rng, bright=2600, slap=(g['echo'], 0.35))
    save(f'{arm}-{nation}.wav', norm(soft_clip(norm(out, 1.0), 1.3)))


# ------------------------------------------------------------------ big guns and blasts
def boom(rng, n, low=40, crack=1.0, body=1.0, rumble=1.0, tau=0.25):
    t = t_of(n)
    x = np.zeros(n)
    L = int(SR * 0.0012)
    x[2:2 + L] += np.linspace(1, -1, L) * crack
    x += band(rng.standard_normal(n), 120, 2500) * np.exp(-t / 0.05) * body
    f = low * (1 + 2.5 * np.exp(-t / 0.02))
    x += np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / tau) * 1.2 * body
    x += lowpass(rng.standard_normal(n), 300) * np.exp(-t / (tau * 4)) * 0.8 * rumble
    return x


CANNONS = {  # 120 mm (M256 / Rh-120) sharper, 125 mm (2A46 / ZPT-98) deeper and longer
    'usa': dict(low=48, crack=1.0, rt=2.4, echo=0.35),
    'europe': dict(low=52, crack=1.1, rt=2.2, echo=0.3),
    'russia': dict(low=40, crack=0.9, rt=2.8, echo=0.4),
    'china': dict(low=43, crack=0.95, rt=2.6, echo=0.38),
    'islamic': dict(low=37, crack=0.85, rt=3.2, echo=0.5),
}


def cannon_file(nation):
    rng = np.random.default_rng(7 + list(CANNONS).index(nation))
    c = CANNONS[nation]
    out = np.zeros(int(SR * 6))
    for i in range(2):
        place(out, boom(rng, int(SR * 2.4), c['low'] * rng.uniform(0.95, 1.05), c['crack'], 1.0, 1.0, 0.22), 0.05 + i * 2.9)
    out = reverb(out, c['rt'], 0.6, rng, bright=1500, slap=(c['echo'], 0.4))
    save(f'tank-cannon-{nation}.wav', norm(soft_clip(norm(out, 1.0), 1.6)))


def blasts():
    rng = np.random.default_rng(31)
    # Howitzer (155 mm): the deepest gun, very long roll.
    out = np.zeros(int(SR * 9))
    for i in range(3):
        place(out, boom(rng, int(SR * 2.8), 33, 1.0, 1.2, 1.4, 0.32), 0.05 + i * 2.9)
    save('howitzer.wav', norm(soft_clip(norm(reverb(out, 3.5, 0.7, rng, 1200, (0.6, 0.35)), 1.0), 1.7)))
    # Rocket artillery (Grad): ignition bangs and the hissing roar of each rocket leaving the rail, a ripple.
    out = np.zeros(int(SR * 6))
    for i in range(10):
        n = int(SR * 1.6)
        t = t_of(n)
        r = band(rng.standard_normal(n), 400, 6000) * np.exp(-t / 0.45) * (1 - np.exp(-t / 0.01))
        r += boom(rng, n, 70, 0.5, 0.5, 0.3, 0.06) * 0.6
        place(out, r, 0.05 + i * 0.45 + rng.uniform(0, 0.05))
    save('grad.wav', norm(soft_clip(norm(reverb(out, 2.0, 0.4, rng, 2500, (0.4, 0.3)), 1.0), 1.4)))
    # Missile launch: booster pop and a rushing roar fading away.
    out = np.zeros(int(SR * 6))
    for i in range(3):
        n = int(SR * 1.8)
        t = t_of(n)
        r = band(rng.standard_normal(n), 300, 5000) * np.exp(-t / 0.6) * (1 - np.exp(-t / 0.02)) * 0.9
        r += boom(rng, n, 90, 0.6, 0.4, 0.2, 0.05) * 0.5
        place(out, r, 0.05 + i * 2.0)
    save('missile.wav', norm(reverb(out, 1.5, 0.35, rng, 3000)))
    # Bomb and explosion: shock crack, deep boom, rolling rumble and falling debris.
    for name, low, seed in (('bomb.wav', 30, 41), ('explosion.wav', 38, 42)):
        r2 = np.random.default_rng(seed)
        out = np.zeros(int(SR * 8))
        for i in range(2):
            n = int(SR * 3.8)
            x = boom(r2, n, low, 1.0, 1.4, 1.6, 0.4)
            deb = np.zeros(n)
            for _ in range(60):  # debris: little impacts scattered over the next seconds
                k = int(SR * r2.uniform(0.3, 2.8))
                L = int(SR * 0.02)
                if k + L < n:
                    deb[k:k + L] += band(r2.standard_normal(L), 800, 5000) * np.exp(-t_of(L) / 0.004) * r2.uniform(0.02, 0.1)
            place(out, x + deb, 0.05 + i * 3.9)
        save(name, norm(soft_clip(norm(reverb(out, 3.0, 0.6, r2, 1500, (0.5, 0.3)), 1.0), 1.8)))
    # Aircraft / helicopter gun (M230 30 mm, GSh-30): heavy rounds at ~10 per second.
    out = np.zeros(int(SR * 5))
    at = 0.05
    while at < 3.8:
        for r in range(6):
            place(out, gunshot(dict(crack=0.5, blast=420, boom=80, energy=1.2), 1.5, rng), at + r * 0.1)
        at += 1.3
    save('airgun.wav', norm(soft_clip(norm(reverb(out, 1.2, 0.35, rng, 2500, (0.25, 0.3)), 1.0), 1.3)))
    # Autocannon (25-30 mm on IFVs): slower, punchier.
    out = np.zeros(int(SR * 5))
    at = 0.05
    while at < 3.8:
        for r in range(3):
            place(out, gunshot(dict(crack=0.55, blast=380, boom=70, energy=1.3), 1.8, rng), at + r * 0.16)
        at += 1.2
    save('autocannon.wav', norm(soft_clip(norm(reverb(out, 1.4, 0.4, rng, 2200, (0.3, 0.3)), 1.0), 1.3)))


# ------------------------------------------------------------------ engines (seamless loops)
LOOP = 3.0


def diesel(rng, n, fire, cyl_rough, dur):
    """Diesel: firing pulses (each a filtered bang) at `fire` Hz, a little uneven, plus exhaust rumble."""
    t = t_of(n)
    f = qf(fire, dur)
    ph = (t * f) % 1
    pulse = np.exp(-ph * 9) * (1 + cyl_rough * np.sin(2 * np.pi * qf(fire / 2, dur) * t) * 0.35)
    x = lowpass(rng.standard_normal(n), fire * 7) * pulse * 1.4
    x += sum(np.sin(2 * np.pi * f * h * t + rng.uniform(0, 6)) * a for h, a in ((0.5, 0.25), (1, 0.45), (2, 0.2), (3, 0.1)))
    x += lowpass(rng.standard_normal(n), 120) * 0.9
    return x


def tracks(rng, n, link, dur, ring=(1300, 2700, 4300)):
    """Track links meshing with the sprocket: a clank per link with a metallic ring, plus road-wheel rumble and squeal."""
    t = t_of(n)
    f = qf(link, dur)
    ph = (t * f) % 1
    hit = np.exp(-ph * 30) * (0.7 + 0.3 * rng.standard_normal(n).clip(-1, 1))
    metal = sum(band(rng.standard_normal(n), r * 0.92, r * 1.08, 3) for r in ring)
    x = metal * hit * 1.6
    x += lowpass(rng.standard_normal(n), 250) * 0.6
    sq = band(rng.standard_normal(n), 2500, 3500, 3) * (0.5 + 0.5 * np.sin(2 * np.pi * qf(0.7, dur) * t)) ** 6
    return x + sq * 0.4


def wheels(rng, n):
    return band(rng.standard_normal(n), 150, 1600) * 0.35 + lowpass(rng.standard_normal(n), 90) * 0.4


def turbine(rng, n, whine, dur, roar=1.0):
    t = t_of(n)
    w = qf(whine, dur)
    x = np.sin(2 * np.pi * w * t) * 0.25 + np.sin(2 * np.pi * w * 1.52 * t) * 0.1
    x += band(rng.standard_normal(n), 400, 3000) * 0.5 * roar
    x += band(rng.standard_normal(n), whine * 0.9, whine * 1.1, 3) * 0.4
    return x


# Ground machines: (diesel firing Hz or 0, roughness, track link Hz or 0 = wheels, turbine whine Hz or 0, gain)
GROUND = {
    'Abrams': (0, 0, 22, 1800, 1.0),          # AGT1500 gas turbine
    'Leopard 2': (36, 0.3, 21, 0, 1.0),       # MTU MB 873 V12
    'T-90': (30, 0.7, 19, 0, 1.0),            # V-92 V12, rougher
    'Type 99': (33, 0.5, 20, 0, 1.0),
    'Karrar': (29, 0.75, 19, 0, 1.0),
    'Twins Shots Tank': (31, 0.6, 18, 0, 1.0),
    'Bradley': (42, 0.4, 25, 0, 0.9),
    'Puma': (45, 0.3, 26, 0, 0.9),
    'BMP-3': (44, 0.6, 27, 0, 0.9),
    'BMP-2': (46, 0.7, 28, 0, 0.9),
    'ZBD-04': (43, 0.5, 26, 0, 0.9),
    'VT 1-2': (38, 0.4, 22, 0, 0.95),
    'K9 Thunder': (37, 0.4, 21, 0, 0.95),
    '2K12 Kub': (40, 0.6, 24, 0, 0.9),
    'LDEW Laser': (35, 0.5, 20, 0, 0.95),
    'PGZ-09': (40, 0.5, 24, 0, 0.9),
    'M88': (26, 0.5, 15, 0, 1.0),
    'BREM-1': (25, 0.8, 15, 0, 1.0),
    'Type 99II': (27, 0.6, 16, 0, 1.0),
    'M104 Wolverine': (29, 0.4, 17, 0, 1.0),
    'Leguan': (31, 0.3, 17, 0, 1.0),
    'MTU-72': (27, 0.8, 16, 0, 1.0),
    'GQL-111': (28, 0.6, 16, 0, 1.0),
    'AVLB': (26, 0.75, 15, 0, 1.0),
    'Humvee': (48, 0.4, 0, 0, 0.75),          # 6.5 L V8 diesel
    'VBL Scout': (52, 0.3, 0, 0, 0.7),
    'UAZ Patrol': (60, 0.8, 0, 0, 0.7),       # petrol, rougher
    'Dongfeng Scout': (50, 0.4, 0, 0, 0.7),
    'Safir Jeep': (64, 0.9, 0, 0, 0.7),
    'Bushmaster': (44, 0.4, 0, 0, 0.8),
    'MTVR': (34, 0.5, 0, 0, 0.85),
    'MAN SV': (33, 0.35, 0, 0, 0.85),
    'KamAZ': (30, 0.8, 0, 0, 0.9),
    'LDEW Laser Truck': (33, 0.5, 0, 0, 0.85),
    'BM-21 Grad': (32, 0.8, 0, 0, 0.85),
    'Patriot': (31, 0.5, 0, 0, 0.85),
    'SAMP/T NG': (32, 0.4, 0, 0, 0.85),
    'S-400': (28, 0.8, 0, 0, 0.9),
    'HQ-9': (30, 0.6, 0, 0, 0.85),
}


def ground_file(name, spec, seed):
    rng = np.random.default_rng(seed)
    fire, rough, link, whine, gain = spec
    n = int(SR * (LOOP + 0.3))
    dur = n / SR
    x = np.zeros(n)
    if fire:
        x += diesel(rng, n, fire, rough, dur)
    if whine:
        x += turbine(rng, n, whine, dur, 0.8) * 1.3
    if link:
        x += tracks(rng, n, link, dur) * 0.9
    else:
        x += wheels(rng, n)
    return norm(soft_clip(norm(loopify(x), 1.0), 1.8), 0.85 * gain)


# Helicopters: blades, rotor rev/s, tail-rotor blades (0 = coaxial), turbine whine Hz.
HELIS = {
    'AH-64 Apache': (4, 4.8, 4, 4200),
    'Z-10': (5, 5.1, 4, 4600),
    'Ka-52': (3, 4.5, 0, 3900),
}


def heli_file(name):
    blades, rev, tail, whine = HELIS[name]
    rng = np.random.default_rng(len(name) * 13)
    n = int(SR * (LOOP + 0.3))
    dur = n / SR
    t = t_of(n)
    x = np.zeros(n)

    def slaps(bpf, phase, gain):
        f = qf(bpf, dur)
        ph = (t * f + phase) % 1
        env = np.exp(-ph * 14)
        return band(rng.standard_normal(n), 80, 1400) * env * gain + np.sin(2 * np.pi * f * t) * 0.3 * gain

    if tail:
        x += slaps(blades * rev, 0, 1.0)
        tf = qf(blades * rev * 4.6, dur)  # tail rotor buzz
        x += band(rng.standard_normal(n), 300, 1500) * (0.5 + 0.5 * np.sin(2 * np.pi * tf * t)) ** 2 * 0.35
    else:
        # Coaxial: two rotors counter-rotating, their slaps interleaved and beating against each other.
        x += slaps(blades * rev, 0, 0.85)
        x += slaps(blades * rev * 1.015, 0.5, 0.85)
    x += turbine(rng, n, whine, dur, 0.6) * 0.35
    x += lowpass(rng.standard_normal(n), 150) * 0.5  # downwash
    return norm(soft_clip(norm(loopify(x), 1.0), 1.6), 0.9)


# Fixed-wing: kind ('fan' turbofan / 'jet' fighter / 'old' turbojet / 'prop' turboprop / 'piston'), roar centre Hz,
# fan tone Hz (or propeller blade-pass Hz), engines.
AIR = {
    'F-22': ('jet', 520, 3100, 2), 'Su-57': ('jet', 600, 3600, 2), 'J-31': ('jet', 560, 3300, 2),
    'Rafale': ('jet', 680, 4100, 2), 'Su-35': ('jet', 580, 3400, 2),
    'B-1A Lancer': ('jet', 380, 2600, 4), 'Tu-160': ('jet', 330, 2300, 4), 'H-6K': ('old', 300, 1900, 2),
    'C-17': ('fan', 300, 2400, 4), 'Il-76': ('old', 340, 2100, 4), 'Y-20': ('fan', 320, 2500, 4),
    'A400M': ('prop', 110, 113, 4), 'E-3 Sentry': ('old', 360, 2200, 4), 'A-50': ('old', 340, 2100, 4),
    'KJ-2000': ('old', 345, 2150, 4), 'A330 AEW': ('fan', 360, 2800, 2), 'Al-Basir AEW': ('prop', 120, 96, 4),
    'B-767': ('piston', 85, 85, 1), 'A-29 Super Tucano': ('prop', 140, 167, 1),
}


def air_file(name):
    kind, roar, tone, eng = AIR[name]
    rng = np.random.default_rng(len(name) * 29 + eng)
    n = int(SR * (LOOP + 0.3))
    dur = n / SR
    t = t_of(n)
    x = band(pink(n, rng), roar * 0.3, roar * 4) * (1.2 if kind != 'piston' else 0.4)
    if kind in ('jet', 'fan', 'old'):
        for e in range(eng):  # each engine's fan tone, slightly detuned: the beating of a multi-engine jet
            x += np.sin(2 * np.pi * qf(tone * (1 + 0.004 * e), dur) * t) * 0.06
        if kind == 'jet':  # crackle of hot exhaust
            cr = (rng.random(n) < 0.004) * rng.standard_normal(n)
            x += band(cr, 1500, 7000) * 1.2
        if kind == 'old':  # older low-bypass engines: rougher, louder mid roar
            x += band(rng.standard_normal(n), 700, 2500) * 0.5
        x += lowpass(rng.standard_normal(n), 120) * 0.6
    elif kind == 'prop':
        f = qf(tone, dur)
        for h, a in ((1, 0.6), (2, 0.35), (3, 0.2), (4, 0.1)):
            x += np.sin(2 * np.pi * f * h * t) * a
        x += np.sin(2 * np.pi * qf(tone * 1.01, dur) * t) * 0.3 * (eng > 1)  # props beating against each other
        x += turbine(rng, n, 2800, dur, 0.3) * 0.25
    else:  # piston buzz
        f = qf(tone, dur)
        x += lowpass(rng.standard_normal(n), f * 6) * np.exp(-((t * f) % 1) * 7) * 1.5
        x += np.sin(2 * np.pi * f * t) * 0.4
    if 'AEW' in name or name in ('E-3 Sentry', 'A-50', 'KJ-2000'):  # radome swish
        x *= 1 + 0.15 * np.sin(2 * np.pi * qf(0.33, dur) * t)
    return norm(soft_clip(norm(loopify(x), 1.0), 1.4), 0.9)


SHIPS = {'USS Enterprise (CVN-80)': 1.0, 'HMS Queen Elizabeth (R08)': 1.1, 'Type 004': 0.95}


def ship_file(name):
    rng = np.random.default_rng(len(name))
    n = int(SR * (LOOP + 0.3))
    dur = n / SR
    t = t_of(n)
    f = qf(6.5 * SHIPS[name], dur)  # shaft / propeller blade rate
    x = np.sin(2 * np.pi * qf(42 * SHIPS[name], dur) * t) * 0.4 + lowpass(rng.standard_normal(n), 90) * 1.0
    x += band(rng.standard_normal(n), 600, 3000) * (0.6 + 0.4 * np.sin(2 * np.pi * f * t)) * 0.35  # cavitation
    x += band(rng.standard_normal(n), 200, 2500) * (0.7 + 0.3 * np.sin(2 * np.pi * qf(0.4, dur) * t)) * 0.5  # bow wash
    return norm(soft_clip(norm(loopify(x), 1.0), 1.3), 0.85)


# ------------------------------------------------------------------ people and surroundings
FEET = {  # weight, scuff Hz, gear (Hz, q-width, level)
    'regular': (1.0, 1700, (2600, 0.15, 0.2)),
    'special': (1.3, 1400, (1800, 0.2, 0.3)),
    'engineer': (1.1, 1700, (4300, 0.06, 0.35)),
    'squatters': (0.7, 2300, None),
    'demolition': (1.1, 1600, (3300, 0.1, 0.3)),
}


def foot_file(tier):
    w, scuff, gear = FEET[tier]
    rng = np.random.default_rng(len(tier) * 7)
    n = int(SR * 0.3)
    t = t_of(n)
    x = np.sin(2 * np.pi * np.cumsum(100 / w * (1 + np.exp(-t / 0.01))) / SR) * np.exp(-t / (0.025 * w)) * 0.8 * w
    x += band(rng.standard_normal(n), scuff * 0.6, scuff * 1.6) * np.exp(-t / 0.03) * 0.6
    x += band(rng.standard_normal(n), 300, 900) * np.exp(-t / 0.015) * 0.5 * w  # heel on gravel
    if gear:
        f, q, lvl = gear
        k = int(SR * 0.03)
        g = band(rng.standard_normal(n - k), f * (1 - q), f * (1 + q), 3) * np.exp(-t_of(n - k) / 0.04) * lvl * 2
        x[k:] += g
    save(f'foot-{tier}.wav', norm(x, 0.8))


def misc():
    rng = np.random.default_rng(99)
    # Boarding: boots on a metal ramp and the hatch slamming.
    n = int(SR * 0.6)
    t = t_of(n)
    x = sum(band(rng.standard_normal(n), r * 0.95, r * 1.05, 3) for r in (420, 980, 2100)) * np.exp(-t / 0.08) * 1.5
    x += np.sin(2 * np.pi * 90 * t) * np.exp(-t / 0.05)
    save('board.wav', norm(reverb(x, 0.5, 0.2, rng, 3000)))
    # Sea: surf rolling in on a 7 s swell, the foam hissing as each wave breaks, a seamless 14 s loop.
    dur = 14.0
    n = int(SR * (dur + 0.3))
    t = t_of(n)
    swell = (0.5 + 0.5 * np.sin(2 * np.pi * qf(1 / 7, n / SR) * t - 1.2)) ** 3
    x = lowpass(pink(n, rng), 600) * (0.4 + swell) * 1.2
    x += band(rng.standard_normal(n), 2000, 8000) * swell ** 2 * 0.35
    save('sea-waves.wav', norm(soft_clip(norm(loopify(x, 1.0), 1.0), 1.2), 0.8))


# ------------------------------------------------------------------ run
def main():
    os.makedirs(OUT, exist_ok=True)
    for nation in GUNS:
        for arm in ARMS:
            gun_file(nation, arm)
        cannon_file(nation)
    blasts()
    for i, (name, spec) in enumerate(GROUND.items()):
        save(f'engine-{slug(name)}.wav', ground_file(name, spec, 200 + i))
    for name in HELIS:
        save(f'engine-{slug(name)}.wav', heli_file(name))
    for name in AIR:
        save(f'engine-{slug(name)}.wav', air_file(name))
    for name in SHIPS:
        save(f'engine-{slug(name)}.wav', ship_file(name))
    # Shared engines by kind, for any machine without a file of its own.
    save('engine-tank.wav', ground_file('tank', (32, 0.5, 20, 0, 1.0), 900))
    save('engine-ifv.wav', ground_file('ifv', (44, 0.5, 26, 0, 0.9), 901))
    save('engine-light.wav', ground_file('light', (52, 0.5, 0, 0, 0.7), 902))
    save('engine-truck.wav', ground_file('truck', (32, 0.6, 0, 0, 0.85), 903))
    save('engine-repair.wav', ground_file('repair', (26, 0.6, 15, 0, 1.0), 904))
    for tier in FEET:
        foot_file(tier)
    misc()
    with open(LIST, 'w', encoding='utf-8') as f:
        f.write('// Generated by tools/sound_bank.py: the sound files in public/sounds/ (the game only fetches these).\n')
        f.write('export const SOUND_BANK: readonly string[] = [\n')
        for name in sorted(written):
            f.write(f"  '{name}',\n")
        f.write('];\n')
    print(len(written), 'files')


if __name__ == '__main__':
    main()
