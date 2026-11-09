---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", "revisar layout", "revisar interface", or "check my site against best practices".
metadata:
  author: vercel (adaptado para o Liang)
  version: "1.0.0-liang"
  origem: github.com/vercel-labs/agent-skills (skills/web-design-guidelines) + github.com/vercel-labs/web-interface-guidelines@434b7f9 (command.md)
  argument-hint: <arquivo-ou-padrão>
---

# Web Interface Guidelines (cópia local)

Revisa arquivos de interface contra as Web Interface Guidelines da Vercel.

As regras estão em [`diretrizes.md`](diretrizes.md), copiadas do repositório original para não depender da internet. Não buscar a versão online; para atualizar, substituir `diretrizes.md` pelo `command.md` mais recente do repositório.

## Como usar

1. Ler `diretrizes.md`.
2. Ler os arquivos indicados (ou, sem argumento, `src/app/features/**/*.ts`, `src/app/shared/*.ts` e `src/styles.scss`).
3. Aplicar todas as regras e responder no formato `arquivo:linha` pedido em `diretrizes.md`.

## Adaptação ao Liang (vence as diretrizes em caso de conflito)

- As regras de negócio e de interface do `CLAUDE.md` do projeto vencem as diretrizes.
- O projeto é Angular (templates inline em `src/app/features/**`). Onde as diretrizes falam de React (`onClick`, `<Link>`, `useEffect`), ler como o equivalente Angular (`(click)`, `routerLink`, `effect()`).
- Meta: WCAG 2.2 AA. Alvos de toque ≥ 44px (uso de pé, com uma mão). Preços e códigos (`.num`, etiqueta amarela) com contraste acima do mínimo AA.
- Textos da interface em português do Brasil; as regras de tipografia das diretrizes que tratam de aspas e reticências valem com a pontuação brasileira.
