#!/usr/bin/env bash
# Abre todos os perfis configurados em UMA única instância do Chromium (mesmo browser/GPU/Network),
# organizados em grade (ex.: 2x2) para economizar CPU/RAM e manter todas as contas visíveis.
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
  echo "[$(date -Is)] iniciando autostart (perfis=$PROFILES_CSV, app=$APP_MODE)"

  BIN="/usr/lib/chromium/chromium"
  [ -x "$BIN" ] || BIN="/usr/bin/chromium"

  # Espera o X11/Openbox estabilizar
  for _ in $(seq 1 30); do
    xrandr --current >/dev/null 2>&1 && break
    sleep 0.5
  done

  # Descobre a resolução atual da tela virtual (fallback 1440x900)
  RES="$(xrandr --current 2>/dev/null | awk '/\*/{print $1; exit}')"
  SCR_W="${RES%x*}"
  SCR_H="${RES#*x}"
  case "$SCR_W" in ''|*[!0-9]*) SCR_W="${SELKIES_MANUAL_WIDTH:-1440}" ;; esac
  case "$SCR_H" in ''|*[!0-9]*) SCR_H="${SELKIES_MANUAL_HEIGHT:-900}" ;; esac

  IFS=',' read -r -a PROFILES <<< "$PROFILES_CSV"
  COUNT="${#PROFILES[@]}"
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
  echo "[$(date -Is)] tela=${SCR_W}x${SCR_H} grade=${COLS}x${ROWS} janela=${WIN_W}x${WIN_H}"

  # Limpa locks órfãos se não houver Chromium rodando
  if ! pgrep -f "$BIN" >/dev/null 2>&1; then
    rm -f "$DATA_DIR"/Singleton*
  fi

  # Remove aviso "Restore pages?" e desmaximiza janelas antigas antes de subir
  for i in "${!PROFILES[@]}"; do
    prof="${PROFILES[$i]}"
    pref="$DATA_DIR/$prof/Preferences"
    [ -f "$pref" ] || continue
    col=$(( i % COLS ))
    row=$(( i / COLS ))
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
  done

  COMMON_FLAGS=(
    --user-data-dir="$DATA_DIR"
    --load-extension=/extension
    --disable-extensions-except=/extension
    --no-sandbox
    --disable-dev-shm-usage
    --password-store=basic
    --no-first-run
    --no-default-browser-check
    --test-type
    --disable-session-crashed-bubble
    --hide-crash-restore-bubble
    --simulate-outdated-no-au="Tue, 31 Dec 2099 23:59:59 GMT"
    --disable-gpu
    --disable-gpu-rasterization
    --mute-audio
    --disable-smooth-scrolling
    --disable-background-networking
    --disable-component-update
    --disable-sync
    --disable-pings
    --media-router=0
    --disable-features=site-per-process,Translate,MediaRouter
    --js-flags="--max-old-space-size=${HEAP_MB}"
  )

  list_wids() {
    xdotool search --onlyvisible --class chromium 2>/dev/null | sort -u
  }

  for i in "${!PROFILES[@]}"; do
    prof="${PROFILES[$i]}"
    col=$(( i % COLS ))
    row=$(( i / COLS ))
    wx=$(( col * WIN_W ))
    wy=$(( row * WIN_H ))

    before="$(list_wids)"

    TARGET_ARGS=(--new-window "$URL")
    if [ "$APP_MODE" = "1" ]; then
      TARGET_ARGS=(--app="$URL")
    fi

    echo "[$(date -Is)] abrindo perfil '$prof' em ${wx},${wy} (${WIN_W}x${WIN_H})"
    "$BIN" \
      "${COMMON_FLAGS[@]}" \
      --profile-directory="$prof" \
      --window-size="${WIN_W},${WIN_H}" \
      --window-position="${wx},${wy}" \
      "${TARGET_ARGS[@]}" >/dev/null 2>&1 &

    # Para o 1º perfil, espera o SingletonSocket existir para os demais reutilizarem o MESMO browser process
    if [ "$i" -eq 0 ]; then
      for _ in $(seq 1 30); do
        [ -S "$DATA_DIR/SingletonSocket" ] && break
        sleep 0.5
      done
    fi

    # Aguarda a nova janela aparecer e encaixa exatamente na célula da grade
    new_wid=""
    for _ in $(seq 1 25); do
      after="$(list_wids)"
      new_wid="$(comm -13 <(printf '%s\n' "$before" | sed '/^$/d') <(printf '%s\n' "$after" | sed '/^$/d') | head -n 1)"
      [ -n "$new_wid" ] && break
      sleep 0.4
    done

    if [ -n "$new_wid" ]; then
      xdotool windowmove --sync "$new_wid" "$wx" "$wy" windowsize --sync "$new_wid" "$WIN_W" "$WIN_H" 2>/dev/null || true
      echo "[$(date -Is)] perfil '$prof' posicionado (wid=$new_wid)"
    else
      echo "[$(date -Is)] aviso: janela do perfil '$prof' não detectada pelo xdotool"
    fi

    if [ "$i" -lt $(( COUNT - 1 )) ]; then
      sleep "$STAGGER"
    fi
  done

  echo "[$(date -Is)] todos os $COUNT perfis abertos."
) &
