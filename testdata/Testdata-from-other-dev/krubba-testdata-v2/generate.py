"""Krubba testdata v2 – hösilageanalyser förankrade i Växas foderstatistik 2026.

Källa för fördelningar: Växa, "Foderanalyser för hela Sverige", skördeår 2026 (NorFor FAS),
utdrag 2026-10-11. Värden per kg ts. Hästvärden (OE häst, smb rp häst) finns inte i
Växas NorFor-statistik och är HÄRLEDDA med förenklade formler nedan – approximationer.
"""
import json, os, random, subprocess, csv
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from PIL import Image, ImageFilter, ImageDraw, ImageEnhance

FD = "/usr/share/fonts/truetype/dejavu/"
pdfmetrics.registerFont(TTFont("DV", FD + "DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DVB", FD + "DejaVuSans-Bold.ttf"))
ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = ROOT + "/out"
for d in ["pdf", "bilder", "data"]:
    os.makedirs(f"{OUT}/{d}", exist_ok=True)

KALLA = "Växa foderstatistik skördeår 2026, hela Sverige (NorFor FAS), utdrag 2026-10-11"
DISCLAIMER = "TESTDATA – fiktiv rapport byggd på Växas foderstatistik 2026. Inte en riktig labbrapport."

# ---------- Riktig statistik från Växa (medel, P10, P90), per kg ts ----------
# TS i g/kg, OMD = OS smältbarhet %, makro g/kg ts, spår mg/kg ts
STAT = {
 "blandvall_ens_s1": dict(namn="Ensilage, blandvall (1–50 % klöver), skörd 1", n=1677, kod=165, skord=1,
   TS=(396.8, 268, 566), Aska=(70.6, 57, 83), OMD=(75.6, 69.4, 80.0), RP=(150.3, 109, 188),
   NDF=(464.5, 400, 541), Socker=(61.4, 20, 112), NH3N=(81.0, 41, 119),
   Ca=(5.3, 3.7, 7.4), P=(2.66, 2.0, 3.3), Mg=(1.71, 1.3, 2.1), K=(23.4, 17.3, 28.8), Na=(0.83, 0.1, 1.8), S=(2.02, 1.5, 2.6),
   Fe=(180, 72, 325), Mn=(57.9, 32, 85), Zn=(31.5, 22, 36), Cu=(6.16, 4.7, 7.9), Se=(0.030, 0.006, 0.050)),
 "blandvall_ens_s2": dict(namn="Ensilage, blandvall (1–50 % klöver), skörd 2", n=1052, kod=165, skord=2,
   TS=(452.8, 303, 666), Aska=(77.8, 64, 92), OMD=(74.2, 70.8, 77.4), RP=(151.6, 117, 186),
   NDF=(459.0, 410, 507), Socker=(64.9, 21, 116), NH3N=(68.6, 33, 104),
   Ca=(6.77, 4.7, 9.4), P=(2.79, 2.3, 3.3), Mg=(2.27, 1.7, 2.8), K=(24.2, 17.4, 30.4), Na=(1.09, 0.2, 2.3), S=(2.31, 1.7, 2.9),
   Fe=(153, 71, 235), Mn=(70.2, 39, 106), Zn=(32.7, 22, 37), Cu=(7.36, 5.5, 9.1), Se=(0.030, 0.008, 0.050)),
 "blandvall_ens_s3": dict(namn="Ensilage, blandvall (1–50 % klöver), skörd 3", n=333, kod=165, skord=3,
   TS=(456.7, 318, 636), Aska=(80.0, 66, 94), OMD=(74.7, 71.4, 77.9), RP=(158.9, 127, 193),
   NDF=(431.8, 384, 479), Socker=(72.4, 28, 119), NH3N=(65.0, 31, 100),
   Ca=(8.10, 5.8, 11.8), P=(2.71, 2.1, 3.3), Mg=(2.61, 2.0, 3.25), K=(22.6, 16.45, 27.7), Na=(1.29, 0.3, 2.4), S=(2.55, 2.0, 3.1),
   Fe=(152, 73, 279), Mn=(75.7, 39, 115), Zn=(32.6, 21, 36), Cu=(7.49, 5.8, 9.6), Se=(0.040, 0.011, 0.070)),
 "gras_ens_s1": dict(namn="Ensilage, gräs (0 % klöver), skörd 1", n=87, kod=162, skord=1,
   TS=(460.1, 273, 822), Aska=(65.2, 49, 82), OMD=(73.1, 64.1, 80.2), RP=(130.6, 77, 178),
   NDF=(494.0, 417, 578), Socker=(65.8, 18, 116), NH3N=(78.0, 27, 114),
   Ca=(4.65, 3.4, 6.3), P=(2.42, 1.8, 3.1), Mg=(1.69, 1.3, 2.2), K=(19.9, 12.9, 27.2), Na=(0.62, 0.1, 1.7), S=(1.82, 1.1, 2.5),
   Fe=(189, 66, 372), Mn=(76.6, 38, 124), Zn=(27.9, 21, 36), Cu=(6.02, 4.1, 8.0), Se=(None, None, None)),
 "ho_blandvall": dict(namn="Hö, blandvall (0–50 % baljväxter)", n=66, kod=383, skord=1,
   TS=(840.9, 729, 912), Aska=(52.7, 40, 69), OMD=(65.5, 60.9, 71.6), RP=(80.3, 53, 107),
   NDF=(571.0, 512, 631), Socker=(121.6, 89, 159), NH3N=(None, None, None),
   Ca=(3.52, 1.7, 5.2), P=(1.83, 1.3, 2.5), Mg=(1.31, 0.8, 1.9), K=(14.4, 9.6, 18.7), Na=(0.31, 0.1, 0.8), S=(1.37, 1.0, 2.2),
   Fe=(107, 43, 169), Mn=(73.2, 34, 151), Zn=(21.8, 17, 29), Cu=(4.58, 3.0, 6.4), Se=(None, None, None)),
}

# ---------- Härledning av hästvärden (APPROXIMATION, inte officiell SLU-formel) ----------
def oe_hast(omd, aska):
    """OE häst MJ/kg ts ≈ smältbar organisk substans × 14,5 MJ/kg."""
    return round(omd / 100 * (1000 - aska) / 1000 * 14.5, 1)

def smbrp_hast(rp):
    """smb rp häst g/kg ts ≈ 0,87 × råprotein − 26."""
    return round(max(0, 0.87 * rp - 26))

# ---------- Riktlinjer (Eurofins, Tolka din näringsanalys för häst) ----------
RIKT = dict(kvot_vuxen=(5.5, 6.5), kvot_ung=(8, 9), aska_max=100, socker_ems_max=100,
            oe_vallfoder=(6, 12.5), grovfoder_min_ts_pct_kv=1.5)

def pick(st, key, lvl):
    v = st[key]
    if v[0] is None:
        return None
    return v[{"medel": 0, "p10": 1, "p90": 2}[lvl]]

# ---------- Scenarier: varje analys = en statistikgrupp + val av nivå per parameter ----------
SCEN = [
 dict(id="A01-medel-skord1", grupp="blandvall_ens_s1", lab="A", paket="Komplett", fodertyp="Hösilage",
      parti="Rundbal, vall 1, förstaskörd", provnr="TA-2026-20114", skord="2026-06-10", prov="2026-08-28",
      niva={}, syfte="Rikssnittet för vanligaste fodret. Basfall: OK energi, högt protein, lågt selen."),
 dict(id="A02-sen-skord-fiberrik", grupp="blandvall_ens_s1", lab="A", paket="Standard", fodertyp="Hösilage",
      parti="Fyrkantsbal, sent skördad", provnr="TA-2026-20391", skord="2026-07-15", prov="2026-09-04",
      niva=dict(TS="p90", OMD="p10", RP="p10", NDF="p90", Socker="medel", Aska="p10"),
      syfte="Sen skörd: lägre energi och protein, mer fiber. Kvoten hamnar strax över vuxenbehov men under unghästens 8–9."),
 dict(id="A03-tidig-skord-proteinrik", grupp="blandvall_ens_s2", lab="A", paket="Komplett", fodertyp="Ensilage",
      parti="Plansilo, återväxt", provnr="TA-2026-21007", skord="2026-07-28", prov="2026-09-20",
      niva=dict(TS="p10", OMD="p90", RP="p90", NDF="p10", Ca="p90", K="p90"),
      syfte="Blött, energirikt och proteinrikt. Kvoten smb rp/OE blir hög; risk för överutfodring av vuxen häst."),
 dict(id="B04-hoga-socker-ho", grupp="ho_blandvall", lab="B", paket="Häst Plus", fodertyp="Hö",
      parti="Småbal hö, solig sommar", provnr="B-26-4410", skord="2026-06-22", prov="2026-09-11",
      niva=dict(Socker="p90", OMD="p90", RP="medel"),
      syfte="Hö med socker över 100 g/kg ts: varning för EMS/fång. Rapporten anges per kg vara (måste räknas om)."),
 dict(id="A05-bas-utan-mineraler", grupp="gras_ens_s1", lab="A", paket="Bas", fodertyp="Hösilage",
      parti="Rundbal, ren gräsvall", provnr="TA-2026-21533", skord="2026-06-05", prov="2026-10-02",
      niva={}, utan_mineraler=True,
      syfte="Billigaste paketet saknar mineraler. Appen ska säga vad som saknas och använda schablon."),
 dict(id="B06-tredje-skord-hog-aska", grupp="blandvall_ens_s3", lab="B", paket="Häst Plus", fodertyp="Hösilage",
      parti="Bal 7, tredjeskörd", provnr="B-26-5187", skord="2026-08-30", prov="2026-10-06",
      niva=dict(Aska="p90", Fe="p90", Ca="p90", Mg="p90", Socker="p10"),
      syfte="Hög aska/järn tyder på jordinblandning. Högt Ca, lågt socker. Selen nära rikssnittet men lågt."),
 dict(id="A07-ho-lagt-protein", grupp="ho_blandvall", lab="A", paket="Komplett", fodertyp="Hö",
      parti="Storbal hö, sent skördat", provnr="TA-2026-22018", skord="2026-07-20", prov="2026-10-08",
      niva=dict(OMD="p10", NDF="p90"),
      syfte="Sent skördat hö: proteinkvot under 5,5 och socker över 100. Behöver proteintillskott; olämpligt för EMS-häst."),
]

MIN_NAMES = dict(Ca="Kalcium (Ca)", P="Fosfor (P)", Mg="Magnesium (Mg)", K="Kalium (K)", Na="Natrium (Na)",
                 S="Svavel (S)", Fe="Järn (Fe)", Mn="Mangan (Mn)", Zn="Zink (Zn)", Cu="Koppar (Cu)", Se="Selen (Se)")
MAKRO = ["Ca", "P", "Mg", "K", "Na", "S"]
SPAR = ["Fe", "Mn", "Zn", "Cu", "Se"]


def build(s):
    st = STAT[s["grupp"]]
    g = lambda k: pick(st, k, s["niva"].get(k, "medel"))
    ts_pct = round(g("TS") / 10, 1)
    v = dict(ts_pct=ts_pct, aska=round(g("Aska")), rp=round(g("RP")), ndf=round(g("NDF")), socker=round(g("Socker")),
             omd=g("OMD"))
    v["oe_hast"] = oe_hast(v["omd"], v["aska"])
    v["smbrp_hast"] = smbrp_hast(v["rp"])
    v["kvot_smbrp_oe"] = round(v["smbrp_hast"] / v["oe_hast"], 1)
    mins, spar = {}, {}
    if not s.get("utan_mineraler"):
        for k in MAKRO:
            mins[k] = round(g(k), 2)
        for k in SPAR:
            x = g(k)
            # hö/gräsensilage saknar Se i statistiken – använd blandvall skörd 1-medel som schablon
            if x is None and k == "Se":
                x = STAT["blandvall_ens_s1"]["Se"][0] if s["niva"].get("Se") else None
            if x is not None:
                spar[k] = round(x, 3) if k == "Se" else round(x)
    v["makro_g_per_kg_ts"] = mins
    v["spar_mg_per_kg_ts"] = spar
    if v["makro_g_per_kg_ts"]:
        v["ca_p_kvot"] = round(mins["Ca"] / mins["P"], 1)
    return v


def flaggor(v, fodertyp):
    f = []
    k = v["kvot_smbrp_oe"]
    if k < RIKT["kvot_vuxen"][0]:
        f.append(f"Låg proteinkvot ({k} g smb rp/MJ) – under 5,5; för lite protein även för vuxen häst i underhåll.")
    elif k > RIKT["kvot_vuxen"][1]:
        f.append(f"Hög proteinkvot ({k} g smb rp/MJ) – över 6,5; mer protein än vuxen häst behöver, passar unghäst/dräktigt sto.")
    else:
        f.append(f"Proteinkvot {k} g smb rp/MJ – inom 5,5–6,5 för vuxen häst.")
    if v["socker"] > RIKT["socker_ems_max"]:
        f.append(f"Socker {v['socker']} g/kg ts – över 100; olämpligt utan åtgärd för häst med EMS eller fånghistorik.")
    if v["aska"] > RIKT["aska_max"]:
        f.append(f"Aska {v['aska']} g/kg ts – över 100; tyder på jordinblandning.")
    sp = v["spar_mg_per_kg_ts"]
    if sp.get("Fe", 0) > 250:
        f.append(f"Järn {sp['Fe']} mg/kg ts – högt, stöder misstanke om jordinblandning.")
    if not v["makro_g_per_kg_ts"]:
        f.append("Mineraler ej analyserade – foderstaten måste räkna med schablonvärden; mineralfoder rekommenderas.")
    else:
        if "Se" not in sp:
            f.append("Selen ej analyserat. Svenskt vallfoder är nästan alltid selenfattigt (rikssnitt ~0,03 mg/kg ts) – tillskott behövs.")
        elif sp["Se"] < 0.1:
            f.append(f"Selen {sp['Se']} mg/kg ts – mycket lågt; tillskott behövs.")
        if v.get("ca_p_kvot") and v["ca_p_kvot"] > 3:
            f.append(f"Ca:P-kvot {v['ca_p_kvot']} – hög; fosfor kan behöva kompletteras.")
    if v["ts_pct"] < 35:
        f.append(f"TS {v['ts_pct']} % – blött foder; hästen behöver äta mycket vara och hållbarheten efter öppning är kort.")
    return f


def fmt(x, d=1):
    return f"{x:.{d}f}".replace(".", ",")


def header(c, w, h, title, color, adress):
    c.setFillColor(HexColor("#FBE9C8")); c.rect(0, h - 26, w, 26, fill=1, stroke=0)
    c.setFillColor(HexColor("#7A3E00")); c.setFont("DVB", 8.5)
    c.drawCentredString(w / 2, h - 17, DISCLAIMER)
    c.setFillColor(HexColor(color)); c.rect(0, h - 88, w, 62, fill=1, stroke=0)
    c.setFillColor(HexColor("#FFFFFF")); c.setFont("DVB", 18); c.drawString(40, h - 60, title)
    c.setFont("DV", 9); c.drawString(40, h - 76, adress)


def lab_a(c, s, v, w, h):
    header(c, w, h, "Testlabb Alfa – Analysrapport grovfoder häst", "#2E5E4E",
           "Fiktivt laboratorium · Testgatan 1 · 000 00 Exempelstad")
    y = h - 115
    c.setFillColor(HexColor("#222222")); c.setFont("DV", 10)
    for k, val in [("Provnummer", s["provnr"]), ("Provmärkning", s["parti"]), ("Fodertyp", s["fodertyp"]),
                   ("Analyspaket", s["paket"]), ("Skördedatum", s["skord"]), ("Provtagningsdatum", s["prov"]),
                   ("Kund", "Testkund, Exempelgården")]:
        c.drawString(40, y, k); c.drawString(170, y, val); y -= 15
    y -= 10
    rows = [("Torrsubstans (ts)", fmt(v["ts_pct"]), "%", ""),
            ("Aska", fmt(v["aska"], 0), "g/kg ts", "< 100"),
            ("Omsättbar energi häst (OE)", fmt(v["oe_hast"]), "MJ/kg ts", "6–12,5"),
            ("Råprotein (rp)", fmt(v["rp"], 0), "g/kg ts", ""),
            ("Smältbart råprotein häst (smb rp)", fmt(v["smbrp_hast"], 0), "g/kg ts", ""),
            ("Kvot smb rp/OE", fmt(v["kvot_smbrp_oe"]), "g/MJ", "5,5–6,5 vuxen"),
            ("NDF", fmt(v["ndf"], 0), "g/kg ts", ""),
            ("Vattenlösliga kolhydrater (socker)", fmt(v["socker"], 0), "g/kg ts", "< 100 vid EMS")]
    for k, x in v["makro_g_per_kg_ts"].items():
        rows.append((MIN_NAMES[k], fmt(x), "g/kg ts", ""))
    for k, x in v["spar_mg_per_kg_ts"].items():
        rows.append((MIN_NAMES[k], fmt(x, 3) if k == "Se" else fmt(x, 0), "mg/kg ts", ""))
    c.setFont("DVB", 10); c.setFillColor(HexColor("#2E5E4E"))
    c.drawString(40, y, "Parameter"); c.drawString(290, y, "Resultat"); c.drawString(370, y, "Enhet"); c.drawString(450, y, "Riktvärde")
    y -= 6; c.setStrokeColor(HexColor("#2E5E4E")); c.line(40, y, w - 40, y); y -= 15
    c.setFont("DV", 10)
    for i, (k, val, u, r) in enumerate(rows):
        if i % 2 == 0:
            c.setFillColor(HexColor("#F1F5F3")); c.rect(40, y - 4, w - 80, 15, fill=1, stroke=0)
        c.setFillColor(HexColor("#222222"))
        c.drawString(44, y, k); c.drawRightString(340, y, val); c.drawString(370, y, u); c.drawString(450, y, r)
        y -= 15
    y -= 18
    c.setFont("DV", 8); c.setFillColor(HexColor("#555555"))
    lines = ["Analysmetod: NIR. Mineraler: ICP-OES." if v["makro_g_per_kg_ts"] else
             "Analysmetod: NIR. Mineraler ingår inte i analyspaketet Bas.",
             "Riktvärden enligt allmänna rekommendationer för häst. Resultat avser endast det analyserade provet.",
             f"Värdena är hämtade ur {KALLA}.",
             "OE häst och smb rp häst är approximerade för testsyfte."]
    for line in lines:
        c.drawString(40, y, line); y -= 11


def lab_b(c, s, v, w, h):
    header(c, w, h, "TESTLABB BETA · Foderanalys", "#5A3A78", "Fiktivt laboratorium · Provvägen 9 · 111 11 Teststad")
    f = v["ts_pct"] / 100
    y = h - 115
    c.setFillColor(HexColor("#222222")); c.setFont("DV", 10)
    c.drawString(40, y, f"Prov-ID: {s['provnr']}"); c.drawString(300, y, f"Ankom: {s['prov']}"); y -= 15
    c.drawString(40, y, f"Märkning: {s['parti']}"); c.drawString(300, y, f"Paket: {s['paket']}"); y -= 15
    c.drawString(40, y, f"Material: {s['fodertyp']} för häst"); c.drawString(300, y, f"Skördad: {s['skord']}"); y -= 26
    c.setFont("DVB", 12); c.setFillColor(HexColor("#5A3A78"))
    c.drawString(40, y, "Resultat per kg vara (foder i befintligt skick)"); y -= 22
    rows = [("TS-halt", fmt(v["ts_pct"]) + " %"),
            ("Energi, OE häst", fmt(v["oe_hast"] * f, 2) + " MJ/kg"),
            ("Råprotein (RP)", fmt(v["rp"] * f, 0) + " g/kg"),
            ("Smb. RP häst", fmt(v["smbrp_hast"] * f, 0) + " g/kg"),
            ("NDF", fmt(v["ndf"] * f, 0) + " g/kg"),
            ("WSC (socker)", fmt(v["socker"] * f, 0) + " g/kg"),
            ("Aska", fmt(v["aska"] * f, 0) + " g/kg")]
    rows += [(MIN_NAMES[k], fmt(x * f, 2) + " g/kg") for k, x in v["makro_g_per_kg_ts"].items()]
    rows += [(MIN_NAMES[k], (fmt(x * f, 3) if k == "Se" else fmt(x * f, 0)) + " mg/kg") for k, x in v["spar_mg_per_kg_ts"].items()]
    c.setFont("DV", 11); c.setFillColor(HexColor("#222222"))
    col = [40, 310]
    for i, (k, val) in enumerate(rows):
        x = col[i % 2]; yy = y - (i // 2) * 24
        c.setStrokeColor(HexColor("#D9CFE6")); c.roundRect(x, yy - 7, 250, 21, 4, stroke=1, fill=0)
        c.drawString(x + 8, yy, k); c.drawRightString(x + 242, yy, val)
    y -= ((len(rows) + 1) // 2) * 24 + 16
    kom = []
    if v["socker"] > 100:
        kom.append("Kommentar: Hög sockerhalt. Kontrollera lämplighet för hästar med fång eller EMS.")
    if v["aska"] > 85 or v["spar_mg_per_kg_ts"].get("Fe", 0) > 250:
        kom.append("Kommentar: Förhöjd aska och järn, möjlig jordinblandning vid skörd.")
    c.setFont("DVB", 10); c.setFillColor(HexColor("#9B2C2C"))
    for k in kom:
        c.drawString(40, y, k); y -= 16
    c.setFont("DV", 8); c.setFillColor(HexColor("#555555"))
    for line in ["Omräkning till per kg ts: dela värdet med ts-halten (t.ex. 0,85 för 85 %).",
                 f"Värdena bygger på {KALLA}. Hästvärden approximerade."]:
        c.drawString(40, y, line); y -= 11


def make_pdf(s, v):
    p = f"{OUT}/pdf/{s['id']}.pdf"
    c = canvas.Canvas(p, pagesize=A4); w, h = A4
    c.setTitle(f"TESTDATA {s['id']}"); c.setAuthor("Krubba hackathon – testdata")
    (lab_a if s["lab"] == "A" else lab_b)(c, s, v, w, h)
    c.showPage(); c.save()
    png = f"{OUT}/bilder/{s['id']}"
    subprocess.run(["pdftoppm", "-png", "-r", "130", "-singlefile", p, png], check=True)
    return png + ".png"


def phone_photo(png, out, seed):
    random.seed(seed)
    doc = Image.open(png).convert("RGB")
    W, H = doc.size
    bg = Image.new("RGB", (int(W * 1.25), int(H * 1.18)), (92, 70, 52))
    d = ImageDraw.Draw(bg)
    for i in range(0, bg.size[1], 18):
        d.line([(0, i), (bg.size[0], i + random.randint(-6, 6))], fill=(80 + random.randint(0, 20), 60, 44), width=3)
    doc = doc.rotate(random.uniform(-6, 4), expand=True, fillcolor=(92, 70, 52))
    shade = Image.new("L", doc.size, 0)
    sd = ImageDraw.Draw(shade)
    for x in range(doc.size[0]):
        sd.line([(x, 0), (x, doc.size[1])], fill=int(70 * x / doc.size[0]))
    doc = Image.composite(Image.new("RGB", doc.size, (40, 40, 40)), doc, shade)
    bg.paste(doc, (int(W * 0.1), int(H * 0.06)))
    img = bg.filter(ImageFilter.GaussianBlur(1.2))
    img = ImageEnhance.Brightness(img).enhance(0.92)
    img = img.resize((img.size[0] * 3 // 4, img.size[1] * 3 // 4))
    img.save(out, quality=78)


# ---------- Referens-PDF: Sverigestatistiken omräknad för häst ----------
def referens(stat_h):
    p = f"{OUT}/pdf/R00-referens-sverigestatistik-2026.pdf"
    c = canvas.Canvas(p, pagesize=A4); w, h = A4
    c.setTitle("Referens – vallfoder Sverige 2026 för häst")
    header(c, w, h, "Referens: vallfoder i Sverige 2026", "#8C5A0B", "Sammanställt för Krubba-hackathonet")
    y = h - 112
    c.setFont("DV", 9); c.setFillColor(HexColor("#222222"))
    c.drawString(40, y, f"Källa: {KALLA}."); y -= 12
    c.drawString(40, y, "Medel och P10–P90 (80 % av proverna ligger inom spannet). Per kg ts."); y -= 12
    c.drawString(40, y, "OE och smb rp häst är approximationer härledda från OS-smältbarhet, aska och råprotein."); y -= 20
    cols = [("TS %", "TS", 0.1, 0), ("OE häst", "OE", 1, 1), ("Råprot", "RP", 1, 0), ("smb rp", "smbRP", 1, 0),
            ("NDF", "NDF", 1, 0), ("Socker", "Socker", 1, 0), ("Ca", "Ca", 1, 1), ("Se mg", "Se", 1, 3)]
    for key, sh in stat_h.items():
        c.setFont("DVB", 10); c.setFillColor(HexColor("#8C5A0B"))
        c.drawString(40, y, f"{sh['namn']}  (n = {sh['n']})"); y -= 15
        c.setFont("DVB", 8); c.setFillColor(HexColor("#444444"))
        c.drawString(44, y, "")
        for i, (lab, *_r) in enumerate(cols):
            c.drawRightString(150 + i * 55, y, lab)
        y -= 12
        c.setFont("DV", 8.5); c.setFillColor(HexColor("#222222"))
        for li, lvl in enumerate(["medel", "p10", "p90"]):
            c.drawString(44, y, {"medel": "Medel", "p10": "P10", "p90": "P90"}[lvl])
            for i, (lab, k, mult, d) in enumerate(cols):
                x = sh["varden"].get(k, {}).get(lvl)
                c.drawRightString(150 + i * 55, y, "–" if x is None else fmt(x * mult, d))
            y -= 11
        y -= 10
    y -= 6
    c.setFont("DVB", 10); c.setFillColor(HexColor("#2E5E4E")); c.drawString(40, y, "Riktlinjer för tolkning (häst)"); y -= 14
    c.setFont("DV", 8.5); c.setFillColor(HexColor("#222222"))
    for t in ["Kvot smb rp/OE: 5,5–6,5 g/MJ för vuxen häst; 8–9 g/MJ för unghäst och högdräktigt/digivande sto.",
              "OE i vallfoder varierar normalt 6–12,5 MJ/kg ts; runt 8 MJ/kg ts passar många vuxna hästar.",
              "Aska bör ligga under 100 g/kg ts. Socker över 100 g/kg ts: var försiktig med häst som har EMS eller fånghistorik.",
              "Grovfoder minst 1,5 kg ts per 100 kg kroppsvikt och dag.",
              "Källa riktlinjer: Eurofins, Tolka din näringsanalys för häst; Eurofins kunskapsbank, Näringsanalys av grovfoder till häst."]:
        c.drawString(40, y, t); y -= 12
    c.showPage(); c.save()
    return p


def stats_for_horse():
    out = {}
    for key, st in STAT.items():
        vv = {}
        for k in ["TS", "Aska", "RP", "NDF", "Socker", "OMD"] + MAKRO + SPAR:
            m, a, b = st[k]
            if m is not None:
                vv[k] = dict(medel=m, p10=a, p90=b)
        # härledda hästvärden: kombinera samma percentilnivå (approx)
        vv["OE"] = {l: oe_hast(st["OMD"][i], st["Aska"][0]) for i, l in enumerate(["medel", "p10", "p90"])}
        vv["smbRP"] = {l: smbrp_hast(st["RP"][i]) for i, l in enumerate(["medel", "p10", "p90"])}
        out[key] = dict(namn=st["namn"], n=st["n"], foderkod=st["kod"], skord=st["skord"], varden=vv)
    return out


if __name__ == "__main__":
    stat_h = stats_for_horse()
    json.dump(dict(_kalla=KALLA, _url="https://www.vxa.se/fakta/styrning-och-rutiner/mer-om-foder-och-bete/statistik-pa-foderanalyser/",
                   _enheter="TS g/kg vara; Aska, RP, NDF, Socker, makromineraler g/kg ts; spårämnen mg/kg ts; OMD %; OE MJ/kg ts",
                   _obs="OE och smbRP för häst är approximerade (oe_hast/smbrp_hast i generate.py).",
                   riktlinjer=RIKT, grupper=stat_h),
              open(f"{OUT}/data/sverigestatistik-2026.json", "w"), ensure_ascii=False, indent=2)
    referens(stat_h)
    facit = []
    for i, s in enumerate(SCEN):
        v = build(s)
        png = make_pdf(s, v)
        if s["id"] in ("A01-medel-skord1", "B04-hoga-socker-ho", "B06-tredje-skord-hog-aska"):
            phone_photo(png, f"{OUT}/bilder/{s['id']}-mobilfoto.jpg", i)
        facit.append(dict(id=s["id"], fil=f"pdf/{s['id']}.pdf", lab=s["lab"], paket=s["paket"], fodertyp=s["fodertyp"],
                          provnr=s["provnr"], skordedatum=s["skord"], statistikgrupp=STAT[s["grupp"]]["namn"],
                          percentilval=s["niva"] or "medel för alla parametrar",
                          rapportens_enhet="per kg vara" if s["lab"] == "B" else "per kg ts",
                          syfte=s["syfte"], forvantade_varden_per_kg_ts=v, forvantade_flaggor=flaggor(v, s["fodertyp"])))
    json.dump(dict(_info="Facit för Krubba-testanalyserna. Jämför AI:ns avläsning mot forvantade_varden_per_kg_ts.",
                   _kalla=KALLA, analyser=facit),
              open(f"{OUT}/data/facit.json", "w"), ensure_ascii=False, indent=2)
    with open(f"{OUT}/data/facit.csv", "w", newline="") as fh:
        wr = csv.writer(fh, delimiter=";")
        hdr = ["id", "fodertyp", "paket", "enhet_i_rapport", "ts_pct", "oe_hast", "smbrp_hast", "kvot", "rp", "ndf",
               "socker", "aska", "Ca", "P", "Mg", "K", "Na", "S", "Fe", "Mn", "Zn", "Cu", "Se", "flaggor"]
        wr.writerow(hdr)
        for a in facit:
            v = a["forvantade_varden_per_kg_ts"]; m = v["makro_g_per_kg_ts"]; sp = v["spar_mg_per_kg_ts"]
            wr.writerow([a["id"], a["fodertyp"], a["paket"], a["rapportens_enhet"], v["ts_pct"], v["oe_hast"], v["smbrp_hast"],
                         v["kvot_smbrp_oe"], v["rp"], v["ndf"], v["socker"], v["aska"]]
                        + [m.get(k, "") for k in MAKRO] + [sp.get(k, "") for k in SPAR] + [" | ".join(a["forvantade_flaggor"])])
    print("klart")
