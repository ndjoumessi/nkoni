#!/bin/bash
# Montage de la vidéo de démonstration à partir des prises de `record.mjs`.
# Sortie : frontend/public/demo/nkoni-demo.mp4 (+ image d'aperçu .jpg) ; avec LANGUE=en,
# nkoni-demo-en.mp4 / nkoni-demo-en-apercu.jpg (le français garde le nom historique).
#
# Choix d'encodage, et pourquoi :
# - MP4 H.264 SEUL (pas de WebM) : lu partout, y compris sur les iPhone anciens, fréquents chez les
#   utilisateurs cibles ; une seconde source doublerait le poids dans le dépôt pour rien.
# - 720 px de large : la vidéo s'affiche ~360 px CSS dans la page, donc 720 px couvre un écran ×2.
# - `+faststart` : l'index MP4 en tête, la lecture démarre avant la fin du téléchargement.
# - Pas de piste audio (vidéo muette : lecture automatique permise par les navigateurs).
# - Plage VIDÉO (`tv`) et BT.709 explicites : les captures JPEG sont en plage complète (`yuvj420p`),
#   que certains lecteurs affichent délavée.
# Usage : IN=/dossier/des/prises LANGUE=fr|en ./scripts/demo-video/build-video.sh
set -euo pipefail
IN="${IN:?IN = dossier contenant tresoriere/ et membre/}"
LANGUE="${LANGUE:-fr}"
case "$LANGUE" in
  fr) NOM=nkoni-demo ;;
  en) NOM=nkoni-demo-en ;;
  *) echo "LANGUE inconnue : $LANGUE (fr|en)" >&2; exit 1 ;;
esac
RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
SORTIE="$RACINE/frontend/public/demo"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$SORTIE"

for PRISE in tresoriere membre; do
  # Images VIDES écartées. Une capture peut tomber entre le démontage d'une page et l'affichage de la
  # suivante : image uniformément sombre, 33 ms réels mais un scintillement visible à la vidéo (vécu :
  # fiche membre → formulaire de versement). Une image d'interface contient toujours du texte clair
  # (luminance max > 180 mesurée, menu en glissement compris) ; l'image vide plafonnait à 24. Seuil à
  # 60 : l'image est retirée et sa durée reportée sur la précédente — le rythme est conservé.
  ffmpeg -loglevel error -i "$IN/$PRISE/%05d.jpg" \
    -vf "signalstats,metadata=print:key=lavfi.signalstats.YMAX:file=$TMP/$PRISE-ymax.txt" -f null -
  python3 "$(dirname "$0")/ecarter-images-vides.py" \
    "$IN/$PRISE/images.ffconcat" "$TMP/$PRISE-ymax.txt" "$TMP/$PRISE.ffconcat" "$IN/$PRISE"
  # Cadence variable (horodatages réels) → 30 i/s constants, qualité intermédiaire quasi sans perte.
  ffmpeg -loglevel error -y -f concat -safe 0 -i "$TMP/$PRISE.ffconcat" \
    -vf "fps=30,format=yuv420p" -c:v libx264 -crf 14 -preset veryfast "$TMP/$PRISE.mp4"
done

D1="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMP/tresoriere.mp4")"
D2="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMP/membre.mp4")"
FONDU=0.5
DEC="$(echo "$D1 - $FONDU" | bc)"
# Fondu de sortie posé par CALCUL (et non par `reverse`, qui charge toute la vidéo décodée en
# mémoire : ~1,7 Go à 720×1558).
SORTIE_FONDU="$(echo "$D1 + $D2 - $FONDU - 0.45" | bc)"

# Fondu enchaîné entre les prises ; fondus au noir en entrée/sortie pour une boucle sans à-coup
# (l'interface est sombre, le noir s'y fond).
ffmpeg -loglevel error -y -i "$TMP/tresoriere.mp4" -i "$TMP/membre.mp4" -filter_complex "
  [0:v][1:v]xfade=transition=fade:duration=${FONDU}:offset=${DEC}[v];
  [v]fade=t=in:st=0:d=0.35,fade=t=out:st=${SORTIE_FONDU}:d=0.45,scale=720:-2:flags=lanczos:in_range=pc:out_range=tv,format=yuv420p[out]" \
  -map "[out]" -an -c:v libx264 -profile:v high -preset slow -crf 27 -movflags +faststart \
  -pix_fmt yuv420p -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  "$SORTIE/$NOM.mp4"

# Aperçu : le tableau de bord, anneau de recouvrement rempli, première légende visible.
ffmpeg -loglevel error -y -ss 3.2 -i "$SORTIE/$NOM.mp4" -frames:v 1 -q:v 4 "$SORTIE/$NOM-apercu.jpg"

DUREE="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SORTIE/$NOM.mp4")"
echo "✓ $NOM.mp4 : $(du -h "$SORTIE/$NOM.mp4" | cut -f1), ${DUREE%.*} s"
echo "✓ $NOM-apercu.jpg : $(du -h "$SORTIE/$NOM-apercu.jpg" | cut -f1)"
