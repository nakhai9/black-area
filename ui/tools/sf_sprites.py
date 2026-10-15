"""
RA2-style SPECIAL FORCES sheets for 4 factions (same layout as infantry sheets):
  R0 IDLE (low ready, staggered stance) | R1-8 WALK (tactical crouch, 8 frames x 8 facings)
  R9 AIM (kneeling firing position)     | R10 DIE (8 frames)
  Germany KSK  : dark Flecktarn + ranger-green gear, black balaclava, quad NVG glowing GOLD
  USA SOF      : Multicam tan + coyote gear, beard, quad NVG glowing CYAN
  Russia Spetsnaz: slate grey + black gear, Altyn helmet with visor, eye slit glowing RED
  China PLA SOF: jungle green + dark green gear, half mask, tactical goggles glowing ORANGE
Requires bomber_sprites.py, m1_abrams_sprites.py, infantry_sprites.py in the same folder.
"""
import sys
import numpy as np
import infantry_sprites as inf
from infantry_sprites import (ellipsoid, loft_axis, limb, nz, noise3, HEAD, FACE, HELM, NVG, Germany, Russia,
                              USA, China, build_sheet)

GLOW, VISOR, MASK = 80, 81, 82

class SFMixin:
    sf = True
    glasses = False
    radio = True
    knee_pads = True
    hat = "sf"
    GLOWP = GLOW
    glove = np.array([0.10, 0.10, 0.10])
    boot = np.array([0.12, 0.11, 0.10])
    mask = "full"      # full | half | beard | none
    gear_col = np.array([0.2, 0.2, 0.2])
    helm_col = np.array([0.25, 0.25, 0.25])
    accent = np.array([1.0, 1.0, 1.0])
    uni_dark = 0.85

    def vest(self, P): return np.tile(self.gear_col, (len(P), 1)) * (1 + 0.05 * noise3(P, 12, 8))[:, None]
    def helm(self, P): return np.tile(self.helm_col, (len(P), 1)) * (1 + 0.05 * noise3(P, 15, 9))[:, None]

    def colorize(self, part, P, ctx):
        n = len(P)
        if part == GLOW: return np.tile(self.accent * 2.2, (n, 1))
        if part == MASK: return np.tile([0.07, 0.07, 0.08], (n, 1))
        if part == VISOR:
            col = np.tile(self.helm_col * 0.85, (n, 1))
            h = P[:, 0]
            col[(h > 0.135) & (h < 0.165)] = self.accent * 1.7          # glowing eye slit
            return col
        if part == FACE:
            col = super().colorize(part, P, ctx)
            h, fr = P[:, 0], P[:, 2]
            if self.mask == "full":
                eyes = (h > 0.13) & (h < 0.17) & (fr > 0.05)
                col[~eyes] = [0.07, 0.07, 0.08]
            elif self.mask == "half":
                col[h < 0.125] = [0.07, 0.07, 0.08]
            elif self.mask == "beard":
                col[(h < 0.115) & (fr > -0.02)] = [0.30, 0.20, 0.12]
            return col
        col = super().colorize(part, P, ctx)
        if part in (inf.UNI, inf.SHLD): col = col * self.uni_dark
        return col

    # ---------------- headgear
    def high_cut(self, m, hc, hup, hfw, hsd):
        loft_axis(m, hc + hup * 0.03 - hfw * 0.01, hc + hup * 0.17 * HEAD,
                  lambda t: 0.14 * HEAD * np.sqrt(np.clip(1 - t ** 2, 0, 1)) * (1 + 0.05 * (t < 0.12)),
                  lambda t: 0.154 * HEAD * np.sqrt(np.clip(1 - t ** 2, 0, 1)) * (1 + 0.04 * (t < 0.12)),
                  HELM, fwd=hfw, n=14, ns=9, tex=(5, 0, 0))
        for s in (1, -1):
            ellipsoid(m, hc + hsd * s * 0.112 * HEAD, 0.055, 0.04, 0.06, NVG, fwd=hfw, up=hup, n=8, ns=6)
            ellipsoid(m, hc + hsd * s * 0.138 * HEAD + hup * 0.07, 0.075, 0.012, 0.016, NVG, fwd=hfw, up=hup,
                      n=6, ns=5)
        ellipsoid(m, hc - hfw * 0.17 * HEAD + hup * 0.06, 0.035, 0.06, 0.04, NVG, fwd=hfw, up=hup, n=8, ns=6)
        ellipsoid(m, hc + hup * 0.2 * HEAD - hfw * 0.03, 0.022, 0.022, 0.018, GLOW, fwd=hfw, up=hup, n=6, ns=4)

    def quad_nvg(self, m, hc, hup, hfw, hsd):
        base = hc + hfw * 0.125 * HEAD + hup * 0.035
        ellipsoid(m, base + hup * 0.03, 0.03, 0.07, 0.03, NVG, fwd=hfw, up=hup, n=8, ns=6)
        for yy, dz in ((-0.062, 0.0), (-0.022, 0.012), (0.022, 0.012), (0.062, 0.0)):
            c0 = base + hsd * yy + hup * dz
            limb(m, c0, c0 + hfw * 0.085, 0.021, 0.021, NVG, bulge=0)
            ellipsoid(m, c0 + hfw * 0.088, 0.008, 0.02, 0.02, GLOW, fwd=hfw, up=hup, n=8, ns=4)

    def build_hat(self, m, hc, hup, hfw, hsd):
        pass

class GermanySF(SFMixin, Germany):
    name = "KSK"
    gear_col = np.array([0.20, 0.25, 0.17])      # ranger green
    helm_col = np.array([0.22, 0.27, 0.18])
    accent = np.array([1.0, 0.78, 0.10])         # gold
    mask = "full"
    def build_hat(self, m, hc, hup, hfw, hsd):
        self.high_cut(m, hc, hup, hfw, hsd); self.quad_nvg(m, hc, hup, hfw, hsd)

class USASF(SFMixin, USA):
    name = "US SOF"
    gear_col = np.array([0.50, 0.41, 0.28])      # coyote
    helm_col = np.array([0.55, 0.47, 0.33])
    accent = np.array([0.25, 0.85, 1.0])         # cyan
    glove = np.array([0.45, 0.38, 0.27])
    boot = np.array([0.50, 0.41, 0.29])
    mask = "beard"
    uni_dark = 0.95
    def build_hat(self, m, hc, hup, hfw, hsd):
        self.high_cut(m, hc, hup, hfw, hsd); self.quad_nvg(m, hc, hup, hfw, hsd)

class RussiaSF(SFMixin, Russia):
    name = "Spetsnaz"
    gear_col = np.array([0.16, 0.17, 0.17])      # black-grey
    helm_col = np.array([0.36, 0.38, 0.33])      # Altyn olive-grey
    accent = np.array([1.0, 0.18, 0.12])         # red
    mask = "full"
    def build_hat(self, m, hc, hup, hfw, hsd):   # Altyn-style helmet with visor down
        loft_axis(m, hc - hup * 0.02, hc + hup * 0.19 * HEAD,
                  lambda t: 0.15 * HEAD * np.sqrt(np.clip(1 - t ** 2, 0, 1)) * (1 + 0.04 * (t < 0.1)),
                  lambda t: 0.158 * HEAD * np.sqrt(np.clip(1 - t ** 2, 0, 1)) * (1 + 0.04 * (t < 0.1)),
                  HELM, fwd=hfw, n=14, ns=9, tex=(5, 0, 0))
        prof = lambda r: (lambda t: r * np.clip(1 - np.abs(2 * t - 1) ** 3, 0, 1) ** 0.4)
        c = hc + hfw * 0.105 * HEAD - hup * 0.005
        loft_axis(m, c - hup * 0.12 * HEAD, c + hup * 0.13 * HEAD, prof(0.13 * HEAD), prof(0.05 * HEAD), VISOR,
                  fwd=hfw, n=14, ns=10)
        for s in (1, -1):
            ellipsoid(m, hc + hsd * s * 0.13 * HEAD + hup * 0.02, 0.04, 0.02, 0.04, HELM, fwd=hfw, up=hup, n=8, ns=5)

class ChinaSF(SFMixin, China):
    name = "PLA SOF"
    gear_col = np.array([0.17, 0.28, 0.15])      # dark green
    helm_col = np.array([0.22, 0.36, 0.20])
    accent = np.array([1.0, 0.50, 0.08])         # orange
    mask = "half"
    radio = True
    def build_hat(self, m, hc, hup, hfw, hsd):   # helmet + tactical goggles
        self.high_cut(m, hc, hup, hfw, hsd)
        band = lambda r: (lambda t: r * np.clip(1 - np.abs(2 * t - 1) ** 6, 0, 1) ** 0.2)
        loft_axis(m, hc + hup * 0.0, hc + hup * 0.055, band(0.118 * HEAD), band(0.124 * HEAD), NVG, fwd=hfw,
                  n=14, ns=5)
        for s in (1, -1):
            ellipsoid(m, hc + hfw * 0.125 * HEAD + hsd * s * 0.045 + hup * 0.028, 0.02, 0.05, 0.036, GLOW,
                      fwd=hfw, up=hup, n=10, ns=6)

def _main():
    out = "/mnt/user-data/outputs/"
    sel = sys.argv[1:] or ["de", "ru", "us", "cn"]
    table = {"de": (GermanySF, "sf_germany_ksk.png"), "ru": (RussiaSF, "sf_russia_spetsnaz.png"),
             "us": (USASF, "sf_usa_sof.png"), "cn": (ChinaSF, "sf_china_pla_sof.png")}
    for k in sel:
        cls, fn = table[k]
        build_sheet(cls(), out + fn)

# ---------------- glow bloom post-process (patched into the shared renderer)
_base_render = inf.render

def _blur(a, r=2):
    out = a.copy()
    for _ in range(r):
        out = (out + np.roll(out, 1, 0) + np.roll(out, -1, 0) + np.roll(out, 1, 1) + np.roll(out, -1, 1)) / 5
    return out

def sf_render(fac, mesh, facing_deg, lying=False, blood=0.0):
    img = _base_render(fac, mesh, facing_deg, lying, blood)
    acc = getattr(fac, "accent", None)
    if acc is None or lying:
        return img
    a = img[..., 3:4]
    rgb = np.where(a > 1e-4, img[..., :3] / np.maximum(a, 1e-4), 0)
    an = acc / np.linalg.norm(acc)
    sim = (rgb @ an) / np.maximum(np.linalg.norm(rgb, axis=-1), 1e-4)
    core = ((sim > 0.985) & (rgb.max(-1) > 0.25) & (a[..., 0] > 0.5)).astype(float)
    halo = np.clip(_blur(core, 3) * 2.2, 0, 0.75)[..., None]
    glow = np.concatenate([acc[None, None, :] * halo, halo], -1)
    return inf.over(img, glow) if False else glow + img * (1 - halo)

inf.render = sf_render

if __name__ == "__main__":
    _main()
