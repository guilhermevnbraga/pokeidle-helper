#!/bin/sh
# Abre todos os perfis configurados em UMA única instância do Chromium (mesmo browser/GPU/Network),
# organizados em grade (ex.: 2x2) para economizar CPU/RAM e manter todas as contas visíveis.
# Compatível com POSIX sh (dash), pois openbox-autostart invoca `sh autostart`.
set -u

(
  DATA_DIR="/config/.config/chromium"
  URL="${POKEIDLE_URL:-https://pokeidle.io/app}"
  PROFILES_CSV="${POKEIDLE_PROFILES:-Default,Conta2,Conta3,Conta4}"
  STAGGER="${POKEIDLE_STAGGER_SEC:-4}"
  APP_MODE="${POKEIDLE_APP_MODE:-1}"
  HEAP_MB="${POKEIDLE_V8_HEAP_MB:-256}"
  LOG="/tmp/pokeidle-autostart.log"

  exec >>"$LOG" 2>&1
  echo "[$(date -Iseconds)] iniciando autostart (perfis=$PROFILES_CSV, app=$APP_MODE)"

  BIN="/usr/lib/chromium/chromium"
  [ -x "$BIN" ] || BIN="/usr/bin/chromium"

  # Espera o X11/Openbox estabilizar
  i=0
  while [ "$i" -lt 30 ]; do
    xrandr --current >/dev/null 2>&1 && break
    sleep 0.5
    i=$((i + 1))
  done

  # O rc.xml padrão da imagem força <maximized>yes</maximized> em todas as janelas;
  # troca para "no" para o Openbox respeitar a grade 2x2 de janelas menores.
  if [ -f /etc/xdg/openbox/rc.xml ]; then
    if [ ! -f /config/.config/openbox/rc.xml ] || grep -q '<maximized>yes</maximized>' /config/.config/openbox/rc.xml 2>/dev/null; then
      sed 's|<maximized>yes</maximized>|<maximized>no</maximized>|g' /etc/xdg/openbox/rc.xml > /config/.config/openbox/rc.xml
      openbox --reconfigure 2>/dev/null || true
      sleep 0.5
    fi
  fi

  # Descobre a resolução atual da tela virtual (fallback 1440x900)
  RES="$(xrandr --current 2>/dev/null | awk '/\*/{print $1; exit}')"
  SCR_W="${RES%x*}"
  SCR_H="${RES#*x}"
  case "$SCR_W" in ''|*[!0-9]*) SCR_W="${SELKIES_MANUAL_WIDTH:-1440}" ;; esac
  case "$SCR_H" in ''|*[!0-9]*) SCR_H="${SELKIES_MANUAL_HEIGHT:-900}" ;; esac

  # Conta os perfis na lista separada por vírgula
  OLD_IFS="$IFS"
  IFS=','
  set -- $PROFILES_CSV
  IFS="$OLD_IFS"
  COUNT="$#"
  [ "$COUNT" -lt 1 ] && exit 0

  if [ "$COUNT" -le 1 ]; then
    COLS=1; ROWS=1
  elif [ "$COUNT" -le 2 ]; then
    COLS=2; ROWS=1
  elif [ "$COUNT" -le 4 ]; then
    COLS=2; ROWS=2
  else
    COLS=3; ROWS=$(( (COUNT + 2) / 3 ))
  fi

  WIN_W=$(( SCR_W / COLS ))
  WIN_H=$(( SCR_H / ROWS ))
  echo "[$(date -Iseconds)] tela=${SCR_W}x${SCR_H} grade=${COLS}x${ROWS} janela=${WIN_W}x${WIN_H}"

  # Limpa locks órfãos se não houver Chromium rodando
  if ! pgrep -f "$BIN" >/dev/null 2>&1; then
    rm -f "$DATA_DIR"/Singleton*
  fi

  # Remove aviso "Restore pages?" e desmaximiza janelas antigas antes de subir
  idx=0
  for prof in "$@"; do
    pref="$DATA_DIR/$prof/Preferences"
    if [ -f "$pref" ]; then
      col=$(( idx % COLS ))
      row=$(( idx / COLS ))
      wx=$(( col * WIN_W ))
      wy=$(( row * WIN_H ))
      /lsiopy/bin/python3 - "$pref" "$wx" "$wy" "$WIN_W" "$WIN_H" <<'PY' || true
import json, sys
p, x, y, w, h = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
try:
    with open(p, 'r', encoding='utf-8') as f:
        d = json.load(f)
    d.setdefault('profile', {})['exit_type'] = 'Normal'
    d['profile']['exited_cleanly'] = True
    wp = d.setdefault('browser', {}).setdefault('window_placement', {})
    wp.update({'left': x, 'top': y, 'right': x + w, 'bottom': y + h, 'maximized': False})
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(d, f, separators=(',', ':'))
except Exception:
    pass
PY
    fi
    idx=$((idx + 1))
  done

  list_wids() {
    xdotool search --onlyvisible --class chromium 2>/dev/null | sort -u
  }

  find_new_wid() {
    before_list="$1"
    after_list="$2"
    for w in $after_list; do
      found=0
      for b in $before_list; do
        if [ "$w" = "$b" ]; then
          found=1
          break
        fi
      done
      if [ "$found" -eq 0 ]; then
        echo "$w"
        return 0
      fi
    done
    return 1
  }

  idx=0
  for prof in "$@"; do
    col=$(( idx % COLS ))
    row=$(( idx / COLS ))
    wx=$(( col * WIN_W ))
    wy=$(( row * WIN_H ))

    before="$(list_wids)"

    echo "[$(date -Iseconds)] abrindo perfil '$prof' em ${wx},${wy} (${WIN_W}x${WIN_H})"
    if [ "$APP_MODE" = "1" ]; then
      "$BIN" \
        --user-data-dir="$DATA_DIR" \
        --load-extension=/extension \
        --disable-extensions-except=/extension \
        --no-sandbox \
        --disable-dev-shm-usage \
        --password-store=basic \
        --no-first-run \
        --no-default-browser-check \
        --test-type \
        --disable-session-crashed-bubble \
        --hide-crash-restore-bubble \
        --simulate-outdated-no-au="Tue, 31 Dec 2099 23:59:59 GMT" \
        --disable-gpu \
        --disable-gpu-compositing \
        --disable-gpu-rasterization \
        --disable-software-rasterizer \
        --mute-audio \
        --disable-smooth-scrolling \
        --disable-background-networking \
        --disable-component-update \
        --disable-sync \
        --disable-pings \
        --media-router=0 \
        --disable-features=site-per-process,Translate,MediaRouter \
        --js-flags="--max-old-space-size=${HEAP_MB}" \
        --profile-directory="$prof" \
        --window-size="${WIN_W},${WIN_H}" \
        --window-position="${wx},${wy}" \
        --app="$URL" >/dev/null 2>&1 &
    else
      "$BIN" \
        --user-data-dir="$DATA_DIR" \
        --load-extension=/extension \
        --disable-extensions-except=/extension \
        --no-sandbox \
        --disable-dev-shm-usage \
        --password-store=basic \
        --no-first-run \
        --no-default-browser-check \
        --test-type \
        --disable-session-crashed-bubble \
        --hide-crash-restore-bubble \
        --simulate-outdated-no-au="Tue, 31 Dec 2099 23:59:59 GMT" \
        --disable-gpu \
        --disable-gpu-compositing \
        --disable-gpu-rasterization \
        --disable-software-rasterizer \
        --mute-audio \
        --disable-smooth-scrolling \
        --disable-background-networking \
        --disable-component-update \
        --disable-sync \
        --disable-pings \
        --media-router=0 \
        --disable-features=site-per-process,Translate,MediaRouter \
        --js-flags="--max-old-space-size=${HEAP_MB}" \
        --profile-directory="$prof" \
        --window-size="${WIN_W},${WIN_H}" \
        --window-position="${wx},${wy}" \
        --new-window "$URL" >/dev/null 2>&1 &
    fi

    # Para o 1º perfil, espera o SingletonSocket/Lock existir para os demais reutilizarem o MESMO browser process
    if [ "$idx" -eq 0 ]; then
      w=0
      while [ "$w" -lt 30 ]; do
        [ -L "$DATA_DIR/SingletonSocket" ] || [ -S "$DATA_DIR/SingletonSocket" ] && break
        sleep 0.5
        w=$((w + 1))
      done
    fi

    # Aguarda a nova janela aparecer e encaixa exatamente na célula da grade
    new_wid=""
    w=0
    while [ "$w" -lt 25 ]; do
      after="$(list_wids)"
      new_wid="$(find_new_wid "$before" "$after" || true)"
      [ -n "$new_wid" ] && break
      sleep 0.4
      w=$((w + 1))
    done

    if [ -n "$new_wid" ]; then
      xdotool windowmove --sync "$new_wid" "$wx" "$wy" windowsize --sync "$new_wid" "$WIN_W" "$WIN_H" 2>/dev/null || true
      echo "[$(date -Iseconds)] perfil '$prof' posicionado (wid=$new_wid)"
    else
      echo "[$(date -Iseconds)] aviso: janela do perfil '$prof' não detectada pelo xdotool"
    fi

    idx=$((idx + 1))
    if [ "$idx" -lt "$COUNT" ]; then
      sleep "$STAGGER"
    fi
  done

  echo "[$(date -Iseconds)] todos os $COUNT perfis abertos."
) &
