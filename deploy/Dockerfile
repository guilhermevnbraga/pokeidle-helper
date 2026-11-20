FROM lscr.io/linuxserver/chromium:latest

# Barra de tarefas ultraleve (tint2) para alternar entre as 4 contas em tela cheia com 1 clique.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tint2 \
    && rm -rf /var/lib/apt/lists/*
