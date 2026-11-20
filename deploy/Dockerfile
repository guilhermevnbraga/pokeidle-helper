FROM lscr.io/linuxserver/chromium:latest

# Barra de tarefas ultraleve (tint2) para alternar entre as 4 contas em tela cheia com 1 clique
# e desativa o daemon pulseaudio (economiza ~4-5% CPU constante sem áudio).
RUN apt-get update \
    && apt-get install -y --no-install-recommends tint2 \
    && rm -rf /var/lib/apt/lists/* \
    && if [ -f /etc/s6-overlay/s6-rc.d/svc-pulseaudio/run ]; then \
         printf '#!/bin/sh\nexec sleep infinity\n' > /etc/s6-overlay/s6-rc.d/svc-pulseaudio/run; \
       fi
