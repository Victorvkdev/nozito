# Nózito — Art Style

Base: o visual do **Krowlect** (victorvk.com/game). Mesma família — noite, violeta, pixel art crocante —
mas o Nózito é **filhote e aconchegante**: mais fofo, mais redondo, mais cores quentes de ninho.
Quem joga um tem que reconhecer o outro na hora.

---

## 1. Regras de ouro

1. Pixel art crocante: `image-rendering: pixelated`, `imageSmoothingEnabled = false`. Nunca blur, nunca anti-alias.
2. Escala inteira sempre (2x, 3x, 4x). Nunca 2.5x.
3. Contorno escuro `#0e0b16` (char `k`) em todo sprite, 1 px.
4. Luz vem de cima-esquerda: realce em cima/esquerda, sombra embaixo/direita.
5. Fofo, nunca assustador. Morte = triste e fofa (olhos em X, fantasminha), nunca sangue.
6. Cantos de UI no máximo 4px; bordas "chunky" em degraus (box-shadow), como no Krowlect.

---

## 2. Paleta

Mesmos códigos do Krowlect (`sprites.js` → `PALETTES.default`), para os chars serem compatíveis.

### Núcleo (herdado do Krowlect)

| Uso | Char | Hex |
|---|---|---|
| Contorno / fundo mais escuro | `k` | `#0e0b16` |
| Corpo do corvo (sombra) | `K` | `#181225` |
| Corpo do corvo | `b` | `#271f3b` |
| Corpo do corvo (luz) | `B` | `#372c55` |
| Brilho das penas | `h` / `H` | `#4b3a78` / `#8b6fd1` |
| Violeta escuro | `u` | `#4a2a9e` |
| Violeta principal | `v` | `#7c4dff` |
| Violeta claro | `V` | `#a78bfa` |
| Lilás muito claro | `l` | `#ddd0ff` |
| Branco do olho | `w` / `W` | `#f4f1ea` / `#c4bccf` |
| Dourado | `G` / `g` / `y` | `#b07d23` / `#f5c542` / `#fff2b0` |
| Bico e pés (cinza) | `N` / `j` / `X` | `#4f4a66` / `#8a85a6` / `#9a93b0` |
| Alerta (fome forte) — usar pouco | `R` / `r` / `t` | `#741a2e` / `#c2334a` / `#ff6b81` |
| Verde (Sementes, plantas) | `M` / `m` / `n` | `#2c4a37` / `#4a7a5a` / `#7fae6e` |
| Madeira / ninho | `e` / `o` / `O` / `T` | `#3d2a1d` / `#6b4a2f` / `#946b43` / `#c9a36a` |
| Fogo / luz quente | `f` / `F` | `#ff8a3d` / `#ffd27a` |
| Azul gelo | `C` / `c` | `#2f8fc0` / `#6fe3ff` |

### Acréscimos do Nózito (aconchego)

| Uso | Char sugerido | Hex |
|---|---|---|
| Bochecha rosada | `ç` | `#e98aa6` |
| Palha do ninho (luz) | `ñ` | `#e2c27a` |
| Céu de fim de tarde (cenários) | `ã` | `#3a2d5c` |

Regra: a UI e o corvo vivem 90% em ink + violeta. Dourado = recompensa/destaque. Verde = Semente.
Vermelho só para fome crítica.

---

## 3. Tipografia (igual ao Krowlect)

- Títulos: **Pixelify Sans** 600/700
- Números e texto: **VT323**, fallback `ui-monospace`
- Logo "NÓZITO": Pixelify Sans 700, dourado `#f5c542` com sombra dura `3px 3px 0 #4b2aa8` (mesmo tratamento do logo KROWLECT)
- Texto em cima do cenário: sombra dura preta `2px 2px 0 #000`

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600;700&family=VT323&display=swap">
```

---

## 4. O Nózito (personagem)

- **Tamanho:** 32×32 px, exibido em 4x (128 px) no palco, 2x nos ícones.
- **Silhueta:** filhote redondo, cabeça grande (≈55% da altura), corpo de bolinha, asinhas curtas, pés cinza.
  É o "Rei Corvo" do Krowlect versão bebê: **sem coroa, sem capa**.
- **Olho:** grande, branco `w` com íris violeta `v`/`V` e um pixel de brilho `l` — mesmo olho do Krowlect, maior.
- **Bico:** cinza `N`/`j`, curto e arredondado.
- **Detalhe fofo:** 2 px de bochecha `ç` abaixo do olho.
- **Penacho:** 2–3 pixels de pena em pé no topo da cabeça (âncora natural dos chapéus).

### Estados (frames)

| Estado | Frames | Visual |
|---|---|---|
| `idle` | 2 | Respira (sobe/desce 1 px) + piscada |
| `happy` | 2 | Olhos `^ ^` (igual ao frame 2 do Krowlect), pulinho |
| `eat` | 2 | Bico abre/fecha |
| `pet` | 1 | Olho fechado, bochecha mais rosa, coraçãozinho violeta acima |
| `hungry` | 2 | Olho meio fechado, penacho caído |
| `weak` | 2 | Cinza dessaturado, penas desarrumadas, tremendo 1 px |
| `dead` | 1 | Olhos em X, deitado; vira fantasminha translúcido violeta |
| `squash` | 1 | Achatado no toque (feedback de clique, como no Krowlect) |

### Gerações
O Nózito II, III… usa o mesmo sprite. A geração aparece só como algarismo romano no nome e na lápide.

---

## 5. Itens e cosméticos

| Tipo | Tamanho | Exibição | Observação |
|---|---|---|---|
| Ícones da UI / loja | 12×12 | 3x | Mesmo tamanho dos ícones do Krowlect |
| Comidas | 12×12 | 3x | Minhoca (rosa/marrom), Petisco brilhante (dourado), Banquete (prato com brilho) |
| Pedra da Ressurreição | 16×16 | 3x | Cristal violeta com brilho `l`, aura pontilhada |
| Chapéus | 16×12 | mesma escala do corvo | Desenhados por cima do sprite, ancorados no penacho |
| Ninhos | 48×16 | mesma escala do corvo | Ficam atrás/embaixo do corvo |
| Brinquedos | 16×16 | mesma escala do corvo | Ficam no chão, ao lado do ninho |
| Papéis de parede | 160×90 | escala até cobrir | Mesmo formato do `bg_castle` do Krowlect |
| Cenários | 160×90 | escala até cobrir | Camada de fundo + chão |
| Semente (moeda do jogo) | 12×12 | 2–3x | Semente verde `m`/`n` com brilho `y` |

**Faísca:** é a moeda virtual da Rede Énóis, não um item do jogo. Usar o ícone oficial do Énóis, sem redesenhar.

### Âncoras
- Todo chapéu declara `anchor: [x, y]` no `items.json`, relativo ao sprite do corvo (32×32).
- Para trocar de cor sem redesenhar, usar palette swap (como as skins frost/blood/gold do Krowlect).

---

## 6. Cenário padrão

- Variação do `bg_castle` do Krowlect: mesma noite violeta, estrelas e lua pontilhada, sem castelo.
  No lugar dele, um **galho de árvore** com o ninho, folhas `M`/`m`.
- Camadas: céu com gradiente em faixas (sem gradiente suave) → estrelas piscando (`steps(2)`) →
  lua com halo pontilhado (dither) → galho e ninho → névoa violeta embaixo → vinheta nas bordas.

---

## 7. UI

Copiar o sistema do Krowlect (`public/game/css/style.css`):

```css
:root {
  --ink:#0e0b16; --ink2:#120e1d; --panel:#1a1426; --panel2:#221a33; --panel3:#2b2140;
  --line:#3b2d5a; --line2:#54407f; --violet:#7c4dff; --violet2:#a78bfa; --violet-dk:#4b2aa8;
  --gold:#f5c542; --gold-dk:#a8801c; --white:#f4f1ea; --muted:#a397c4; --dim:#6f6590;
  --blood:#c2334a; --moss:#4a7a5a; --px:4px;
  --head:'Pixelify Sans','VT323',ui-monospace,monospace;
  --body:'VT323',ui-monospace,'Courier New',monospace;
}
```

- Moldura pixel: `box-shadow` em 4 lados com `--px` (sem `border-radius`).
- Botões: `.btn` com realce interno em cima e sombra embaixo; pressionado desce 2px.
  Cores: violeta (ação principal), dourado (comprar/recompensa), verde musgo (Sementes), vermelho (só perigo).
- Barras de status (Fome, Humor): 10 segmentos quadrados, não barra lisa.
  Fome: verde → dourado → vermelho. Humor: lilás → violeta.
- Toasts e modais iguais ao Krowlect. Nunca `alert`/`confirm` (sandbox do Énóis).
- Mobile-first: palco do Nózito no topo (~50vh), ações embaixo, alvo de toque ≥ 44px, sem scroll horizontal.

---

## 8. Animação e feedback

- Animações em `steps()`, nunca `ease` suave.
- Toque no Nózito: squash de 1 frame + corações violetas subindo.
- Comer: migalhas em pixels de 2×2 + "+Fome" flutuando em VT323.
- Ganhar Semente: sementinha voa até o contador.
- Morte: tela escurece em 3 passos, lápide sobe do chão.
- Ressurreição: aura violeta pontilhada + flash branco de 2 frames.
- Respeitar `prefers-reduced-motion`: sem tremor, sem flash, partículas reduzidas.

---

## 9. Pipeline (igual ao Krowlect)

1. Rascunho no Piskel (opcional).
2. Arte final como texto: `tools/build_sprites.py` → gera `src/art/sprites.js`
   (linhas de string, 1 char = 1 pixel, `.` = transparente, chars da paleta acima).
3. `renderSprite(id, { scale, frame, skin })` desenha no canvas, com cache em `spriteDataURL`.
4. `tools/sprite-sheet.html` gera o `sprite-sheet.png` para revisão visual antes de cada commit.
5. `og.png` 1200×630 no mesmo estilo do og do Krowlect: logo dourado à esquerda, Nózito grande à direita, lua atrás.

---

## 10. Checklist de um sprite novo

- [ ] Contorno `k` fechado
- [ ] Só cores da paleta
- [ ] Luz de cima-esquerda
- [ ] Lê bem em 2x (silhueta clara)
- [ ] Tem âncora no `items.json` (se for vestível)
- [ ] Revisado no `sprite-sheet.png`
