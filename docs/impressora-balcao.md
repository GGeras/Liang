# Impressora do balcão: Epson TM-T20 (M249A), papel de 80 mm

A notinha sai pelo próprio Chrome. Com o atalho abaixo (`--kiosk-printing`), o toque em **Imprimir** manda direto para a impressora, sem a janela de impressão.

## 1. Driver
1. Baixe no site da Epson (suporte da **TM-T20**) o **EPSON Advanced Printer Driver** (APD) para Windows.
2. Ligue a impressora no USB e instale o driver; ao final ela aparece em *Configurações › Bluetooth e dispositivos › Impressoras e scanners* como **EPSON TM-T20 Receipt**.
3. Nessa tela, desligue **Permitir que o Windows gerencie minha impressora padrão** e defina a **TM-T20 como padrão** (o modo sem janela usa a impressora padrão).

## 2. Corte automático e papel (no driver)
*Impressoras e scanners › EPSON TM-T20 Receipt › Preferências de impressão.* Os nomes podem variar um pouco conforme a versão do driver.
- **Tamanho do papel:** `Roll Paper 80 x 297 mm`.
- **Origem do papel (Paper Source):** `Document [Feed, Cut]` → avança e **corta no fim de cada notinha**.
- **Redução de papel (Paper Reduction):** `Bottom margin` (margem inferior) → não gasta papel em branco depois do rodapé.
- Clique em **Aplicar** e imprima uma página de teste do Windows para conferir o corte.

## 3. Atalho do Chrome na área de trabalho
1. Botão direito na área de trabalho › **Novo › Atalho**.
2. Em local do item, cole (uma linha só):
   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --user-data-dir="C:\LiangBalcao" --app=https://estoque.mundomix.workers.dev/vender
   ```
3. Nome: **Liang Balcão**.
- `--user-data-dir` cria um perfil só para o balcão: assim o modo sem janela vale mesmo com outro Chrome aberto. Na primeira vez, entre no Liang com o usuário do balcão (a sessão fica guardada).
- Se o Chrome estiver em outra pasta, ajuste o caminho (botão direito no ícone do Chrome › Abrir local do arquivo).

## 4. Primeiro teste
1. Abra pelo atalho, faça uma venda e toque em **Imprimir notinha › Imprimir**.
2. Deve sair na hora, cortada logo depois de “NÃO É DOCUMENTO FISCAL”.
3. Se sair em branco, cortada errado ou com margem: feche o atalho, abra o Liang num Chrome comum, imprima uma vez pela janela de impressão com **Impressora: EPSON TM-T20 Receipt**, **Margens: Nenhuma**, **Escala: Padrão (100%)** e **Cabeçalhos e rodapés desmarcado**, e confira o resultado.

## Como a impressão funciona (para manutenção)
- A notinha é o componente `app-notinha` (`src/app/shared/notinha.ts`), com o CSS em `src/_notinha.scss`. A simulação na tela usa o mesmo componente e o mesmo CSS.
- Ao imprimir, `NotinhaService.imprimir` monta a notinha em `#impressao` (fora do app), mede a altura e define `@page { size: 80mm <altura>mm; margin: 0 }`. `size: 80mm auto` não funciona no Chrome: ele descarta a regra e usa papel Carta.
- O QR code do WhatsApp é gerado no app (biblioteca `uqr`, sem internet) a partir do WhatsApp da loja, quando ele é celular com DDD, e fica no cabeçalho ao lado do número; com telefone fixo ou vazio, a notinha sai sem QR e com o cabeçalho centralizado.
- Conteúdo com 72 mm (área impressa da TM-T20) centralizado nos 80 mm, só preto puro, fonte de 11 e 12 px.
- Para conferir que o papel sai igual à simulação: `npm run build && node ferramentas/notinha-pdf.js` (requer `npm i --no-save pdfjs-dist@4.10.38`). Gera o PDF de 80 mm de cada caso e compara com a simulação em tamanho real.
- **Ver tamanho real** usa milímetros do CSS (96 px por polegada). Ele bate com o papel encostado na tela quando a escala do Windows e o monitor correspondem a isso; se não bater, é só a tela: a impressão não muda.
