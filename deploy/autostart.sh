#!/bin/sh
# Abre todos os perfis configurados em UMA única instância do Chromium (mesmo browser/GPU/Network),
# todos em TELA CHEIA (sem corte) com barra inferior tint2 para alternar entre contas com 1 clique.
# Depois que carregam, minimiza automaticamente para zerar GPU/compositor em repouso.
# Compatível com POSIX sh (dash), pois openbox-autostart invoca `sh autostart`.
set -u

(
  DATA_DIR="/config/.config/chromium"
  URL="${POKEIDLE_URL:-https://pokeidle.io/app}"
  PROFILES_CSV="${POKEIDLE_PROFILES:-Default,Conta2,Conta3,Conta4}"
  STAGGER="${POKEIDLE_STAGGER_SEC:-4}"
  APP_MODE="${POKEIDLE_APP_MODE:-1}"
  HEAP_MB="${POKEIDLE_V8_HEAP_MB:-320}"
  AUTO_MIN="${POKEIDLE_AUTO_MINIMIZE:-1}"
  LOG="/tmp/pokeidle-autostart.log"

  exec >>"$LOG" 2>&1
  echo "[$(date -Iseconds)] iniciando autostart (perfis=$PROFILES_CSV, app=$APP_MODE, auto_min=$AUTO_MIN)"

  BIN="/usr/lib/chromium/chromium"
  [ -x "$BIN" ] || BIN="/usr/bin/chromium"

  # Espera o X11/Openbox estabilizar
  i=0
  while [ "$i" -lt 30 ]; do
    xrandr --current >/dev/null 2>&1 && break
    sleep 0.5
    i=$((i + 1))
  done

  # Garante Openbox maximizando todas as janelas (tela cheia completa sem cortes)
  if [ -f /etc/xdg/openbox/rc.xml ]; then
    if [ ! -f /config/.config/openbox/rc.xml ] || grep -q '<maximized>no</maximized>' /config/.config/openbox/rc.xml 2>/dev/null; then
      cp /etc/xdg/openbox/rc.xml /config/.config/openbox/rc.xml
      openbox --reconfigure 2>/dev/null || true
      sleep 0.4
    fi
  fi

  # Sobe a barra inferior de troca de contas (tint2)
  if command -v tint2 >/dev/null 2>&1 && ! pgrep -x tint2 >/dev/null 2>&1; then
    tint2 -c /config/tint2rc >/dev/null 2>&1 &
    sleep 0.5
  fi

  OLD_IFS="$IFS"
  IFS=','
  set -- $PROFILES_CSV
  IFS="$OLD_IFS"
  COUNT="$#"
  [ "$COUNT" -lt 1 ] && exit 0

  # Limpa locks órfãos se não houver Chromium rodando
  if ! pgrep -f "$BIN" >/dev/null 2>&1; then
    rm -f "$DATA_DIR"/Singleton*
  fi

  # Remove aviso "Restore pages?" antes de subir
  for prof in "$@"; do
    pref="$DATA_DIR/$prof/Preferences"
    if [ -f "$pref" ]; then
      /lsiopy/bin/python3 - "$pref" <<'PY' || true
import json, sys
p = sys.argv[1]
try:
    with open(p, 'r', encoding='utf-8') as f:
        d = json.load(f)
    d.setdefault('profile', {})['exit_type'] = 'Normal'
    d['profile']['exited_cleanly'] = True
    wp = d.setdefault('browser', {}).setdefault('window_placement', {})
    wp['maximized'] = True
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(d, f, separators=(',', ':'))
except Exception:
    pass
PY
    fi
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
    before="$(list_wids)"
    echo "[$(date -Iseconds)] abrindo perfil '$prof' (tela cheia)"

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
        --disable-gpu-rasterization \
        --mute-audio \
        --disable-smooth-scrolling \
        --disable-background-networking \
        --disable-component-update \
        --disable-sync \
        --disable-pings \
        --media-router=0 \
        --disable-features=site-per-process,Translate,MediaRouter \
        --js-flags="--max-old-space-size=${HEAP_MB}" \
        --start-maximized \
        --profile-directory="$prof" \
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
        --disable-gpu-rasterization \
        --mute-audio \
        --disable-smooth-scrolling \
        --disable-background-networking \
        --disable-component-update \
        --disable-sync \
        --disable-pings \
        --media-router=0 \
        --disable-features=site-per-process,Translate,MediaRouter \
        --js-flags="--max-old-space-size=${HEAP_MB}" \
        --start-maximized \
        --profile-directory="$prof" \
        --new-window "$URL" >/dev/null 2>&1 &
    fi

    # Para o 1º perfil, espera o SingletonSocket existir para os demais reutilizarem o MESMO browser process
    if [ "$idx" -eq 0 ]; then
      w=0
      while [ "$w" -lt 30 ]; do
        [ -L "$DATA_DIR/SingletonSocket" ] || [ -S "$DATA_DIR/SingletonSocket" ] && break
        sleep 0.5
        w=$((w + 1))
      done
    fi

    # Aguarda a nova janela aparecer e marca um nome inicial na barra (a extensão troca pelo nick depois)
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
      xdotool set_window --name "$prof - Pokeidle" "$new_wid" 2>/dev/null || true
      echo "[$(date -Iseconds)] perfil '$prof' aberto (wid=$new_wid)"
    fi

    idx=$((idx + 1))
    if [ "$idx" -lt "$COUNT" ]; then
      sleep "$STAGGER"
    fi
  done

  echo "[$(date -Iseconds)] todos os $COUNT perfis abertos."

  # Minimiza todas após carregarem: GPU/compositor cai para 0% quando rodando em segundo plano no servidor.
  # Basta clicar em qualquer conta na barra inferior (tint2) para abrir em tela cheia.
  if [ "$AUTO_MIN" = "1" ]; then
    sleep 10
    for wid in $(list_wids); do
      xdotool windowminimize "$wid" 2>/dev/null || true
    done
    echo "[$(date -Iseconds)] janelas minimizadas para modo economia (clique na barra inferior para abrir)."
  fi
) &
