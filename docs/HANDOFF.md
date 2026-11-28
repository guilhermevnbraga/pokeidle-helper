# HANDOFF — estado e como retomar (curto de propósito)

Atualizado: 2026-11-28. Versão da extensão: `1.0.0`. Último commit de código: `fix: prefer the reliable currency when one sale book is far below the 7d average` (ver git log). Repo: `github.com/guilhermevnbraga/pokeidle-helper` (`main`). Testes unitários: 97 passando. Histórico em `docs/archive/` (só Grep).
Checklist detalhado: `docs/PROGRESS.md` (use as pendências `- [ ]`, não leia inteiro).

## Regras de trabalho
Vivem no `AGENTS.md` (não repetir aqui). Termos §5 do PokeIdle: só cliques no DOM, sem API direta, sem mexer em login/anti-robô.

## Estado atual (2026-11-26)
- **1.0.0 publicada** no `main`. README descreve a UI nova (abas, status, pausa, pílula) e os módulos `sell/stones/timing`.
- **Corrigido e validado ao vivo (PT):** `readMyListings` (toggle `#cm-meus` + `.cm-nome`/`.cm-qtd`); Analisador de Venda ignora book suspeito (muito abaixo da média 7d, flag `suspect` em `sell.js`); troca real de hunt (Azurill → Centro → Shedinja); timing do RMT; `captureRe` com toast real; Analisador de Bola na hunt atual.
- **Deploy Proxmox (CT 104, `https://192.168.0.104:3001/`):** UI nova carregou após `docker compose down/up` (a extensão vem do volume `../:/extension`, `--build` não basta). Conta 1 minimizada ~3 min: XP +2,18M, tentativas de captura no log.
- **OOM no servidor (2026-11-28):** de manhã 3 das 4 abas estavam mortas ("Aw, Snap"). Causa: `OOMKilled=true` no container (limite 2800m; renderers 420–820 MB cada, crescendo). Mitigação aplicada NO CT 104 (não está no git): `MEM_LIMIT=3500m` em `/root/pokeidle-helper/deploy/.env` + cron root `0 8 * * * docker restart pokeidle-chromium` (05:00 BRT; CT em UTC). NÃO validado: contas voltaram logadas e se 3500m basta.
- **Decisão do usuário:** ULTRA (`ultraSupplyTick`) fica como está, sem validar nem remover (não captura no ULTRA).

## Próximos passos (ordem)
1. Amanhã: `docker inspect pokeidle-chromium --format '{{.State.OOMKilled}}'` e abas vivas; se OOM de novo, subir RAM do CT no Proxmox e `MEM_LIMIT` junto. Documentar OOM/cron no README.
2. Teste de janela estreita (~500px): só CSS forçado (MCP não emula viewport). Opcional.
3. Validar contas 2–4 do deploy e capturas contínuas por horas (ver log/XP depois de um tempo).
4. Itens `- [ ]` restantes do PROGRESS (+ multi-espécie do Analisador de Bola se aparecer) (Venda v0.9.1 com Pokémon, hardening Market/multi-conta, `/study-game`).

## Pendente do usuário
- Perfis secundários do Chrome local: recarregar a extensão em `chrome://extensions` + `F5` no jogo.
- A conta é a mesma no Chrome local e no servidor: só uma sessão joga por vez (o servidor está jogando; fechei a aba local do MCP).

## Armadilhas
Todas em `docs/BROWSER_QUIRKS.md` (fonte única; leia antes de usar o MCP). Extra: `javascript_tool` do Claude-in-Chrome estoura em 45 s (use esperas curtas e leia o resultado depois); a bind-mount do deploy exige reiniciar o container, não só `--build`; `#cm-meus` é toggle (classe `on`).
