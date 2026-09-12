"""Retire d'une suite ffconcat les images VIDES (luminance max sous un seuil) et reporte leur durée
sur l'image précédente, pour conserver le rythme. Appelé par build-video.sh.

Usage : ecarter-images-vides.py <source.ffconcat> <mesures-ymax.txt> <cible.ffconcat> <dossier-images>
"""
import re
import sys

SEUIL_YMAX = 60

source, mesures, cible, dossier = sys.argv[1:5]
ymax = [int(m) for m in re.findall(r"YMAX=(\d+)", open(mesures, encoding="utf-8").read())]
entrees = re.findall(r"file '([^']+)'\nduration ([\d.]+)", open(source, encoding="utf-8").read())
if len(ymax) != len(entrees):
    sys.exit(f"incohérence : {len(ymax)} mesures pour {len(entrees)} images")

gardees, ecartees = [], 0
for (fichier, duree), y in zip(entrees, ymax):
    if y < SEUIL_YMAX and gardees:
        gardees[-1][1] += float(duree)
        ecartees += 1
    else:
        gardees.append([f"{dossier}/{fichier}", float(duree)])

with open(cible, "w", encoding="utf-8") as f:
    f.write("ffconcat version 1.0\n")
    for fichier, duree in gardees:
        f.write(f"file '{fichier}'\nduration {duree:.3f}\n")
    f.write(f"file '{gardees[-1][0]}'\n")
print(f"  {dossier.rstrip('/').rsplit('/', 1)[-1]} : {ecartees} image(s) vide(s) écartée(s) sur {len(entrees)}")
