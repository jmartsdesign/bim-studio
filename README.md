# BIM Studio — MVP

Um programa BIM simples, inspirado no fluxo de trabalho de editores de arquitetura (como o ArchiCAD), totalmente em **português**. Este é um MVP original — não é uma cópia do ArchiCAD nem usa código ou recursos proprietários dele.

## Como executar

Não precisa instalar nada. Basta abrir o arquivo `index.html` em um navegador moderno (Chrome, Edge ou Firefox com internet, pois o 3D usa a biblioteca Three.js via CDN).

> Dica: se preferir, sirva a pasta com `python3 -m http.server` e acesse `http://localhost:8000`.

## Funções principais

| Categoria | Recurso |
|---|---|
| **Desenho 2D** | Planta com grade métrica, snap ajustável (0,25 m padrão), zoom (roda do mouse) e pan (botão do meio ou Espaço + arrastar) |
| **Ferramentas** | Parede, Porta, Janela (peitoril), Laje, Coluna, Escada, **Rampa de acessibilidade (NBR 9050)**, Telhado, Objeto, Medir, Corte, Apagar |
| **3D** | Vista orbital simultânea com paredes, aberturas recortadas, lajes, colunas e sombras |
| **Propriedades** | Painel para editar dimensões, espessuras, posição de porta/janela na parede, peitoril |
| **Pavimentos** | Múltiplos pavimentos com altura piso-a-piso configurável; isolamento por pavimento |
| **Arquivo** | Salvar/abrir projeto `.json`, salvamento automático no navegador |
| **Edição** | Desfazer (Ctrl+Z) / Refazer (Ctrl+Shift+Z), excluir (Delete) |
| **Cotas** | Cotas automáticas de comprimento nas paredes (ativáveis na barra superior) |
| **IFC** | Exportação IFC4 (`.ifc`) com paredes, aberturas vazadas, lajes, colunas, escada, telhado e mobiliário (IfcFurniture) |
| **Apresentação** | Botão "▶ Apresentar": tour guiado pelas vistas (planta, cortes, fachadas, estudos, memorial) com navegação por setas/teclado |
| **Cortes/Fachadas** | **Múltiplas linhas de corte** (A—A, B—B, C—C...) com rótulos automáticos e seletor no modal; cotas verticais completas; fachadas nas 4 orientações |
| **Camadas** | Paleta por disciplina — Arquitetura, Elétrica (amarelo), Hidráulica (azul) — com visibilidade seletiva em 2D, 3D e pranchas |
| **Instalações** | 8 pontos: tomada, interruptor, luminária, quadro (elétrica); registro, torneira, ralo, caixa d'água (hidráulica) — símbolos 2D com leader e exportação IFC |
| **Norte** | Rosa dos ventos na planta (editor e prancha) com orientação configurável em graus |
| **Circuitos** | Ferramenta 🔌 Circuito: traçe a fiação (pernas ortogonais) com snap automático em pontos elétricos; painel lista circuitos com metragem; alimenta os quantitativos |
| **Quantitativos** | Botão "Quantitativos": relatório de obra (comprimento/área/volume de paredes, área/volume de laje, portas, janelas, pontos, fiação) em prancha imprimível + botão **CSV** para ordem de compra |
| **Sol** | Simulação de sombras (posição astronômica real) + **▶ Timelapse** (dia 6h–18h) + botão **Sazonal**: gráfico comparativo das trajetórias do sol nos solstícios 21/6 vs. 21/12 com picos e conclusão |
| **Iluminação** | Botão "Iluminação": detecção automática de cômodos (flood-fill) com área de piso, área de esquadrias, comparação com o mínimo de 1/6 do piso e veredito ✓/✗ por ambiente |
| **Memorial** | Memorial descritivo técnico automático (10 seções) em prancha imprimível |
| **Ventilação** | Botão "Ventilação": análise de ventilação cruzada por cômodo (aberturas em paredes com eixos divergentes > 60º) com veredito ✓ CRUZADA / ✗ ÚNICA / ✗ SEM ABERTURAS |
| **Orçamento** | Tabela com preços unitários editáveis (R$), subtotais/total ao vivo, persistidos; CSV completo |
| **Terreno** | Botão "Criar terreno": malha 25×25 (células 5 m) com relevo padrão; ferramenta ⛰️ **Terreno** esculpta com pincel suave (clique eleva, Shift+clique rebaixa); **curvas de nível** desenhadas na planta (marching squares) e malha 3D |
| **Tipologias** | "Salvar pavimento como tipologia" + botão **Estampar**: clique na planta para posicionar cópias da unidade (paredes, aberturas com remapeamento de IDs, lajes) — ideal para blocos de apartamentos por pavimento |
| **Versões** | Autossalvamento com **histórico de até 20 versões** (deduplicação de estados idênticos); painel "Versões" lista com data/hora e botão **Restaurar**; botão "Salvar versão" para snapshots rotulados |
| **Biblioteca** | 10 objetos **paramétricos** (largura/profundidade/altura editáveis por instância): sofá, cama, mesa, cadeira, geladeira, fogão, bancada/pia, vaso sanitário, box e armário — com rotação e exportação IFC |
| **Medição** | Modo Medir: distância livre entre dois pontos com snap, exibida na planta |
| **Impressão/PDF** | Botão "Imprimir / PDF" no modal — salva como PDF via caixa de impressão do navegador, com a vista isolada em página branca |
| **Pranchas** | Carimbo/quadro de título automático em todas as pranchas (Projeto, Vista, Escala, Data, Programa) |
| **Escala configurável** | Seletor no modal: Automática, 1:50, 1:100, 1:125, 1:200 — re-renderiza a vista na hora; escala exata cotada no carimbo |
| **Planta PDF** | Botão "Planta PDF" gera a planta do pavimento ativo em prancha completa (paredes cotadas, portas, escadas, objetos, carimbo) — imprimível e exportável |
| **PNG** | Botão "🖼️ PNG" salva qualquer vista gerada (corte, fachada, planta) como imagem PNG |

## Fluxo básico

1. Selecione a ferramenta **Parede** e clique pontos na grade — as paredes se encadeiam; clique direito encerra a sequência.
2. Com **Porta**/**Janela**, clique sobre uma parede — a abertura entra na posição clicada.
3. **Laje**/**Telhado**: clique os vértices e dê duplo clique (ou clique perto do primeiro ponto) para fechar o polígono.
4. **Camadas**: marque/desmarque as disciplinas no painel Camadas para filtrar o que aparece em 2D/3D/pranchas. Ajuste o **Norte** (graus) abaixo — a rosa dos ventos acompanha.
5. **Instalações**: ferramenta ⚡ + escolha o ponto no painel Instalações; clique na planta para inserir.
6. **Vários cortes**: cada linha de corte recebe rótulo automático (A, B, C...); selecione qual cortar no modal.
7. **Circuitos**: ferramenta 🔌 — clique pontos (snap em tomadas); duplo clique finaliza. Veja metragens no painel Circuitos.
8. **Quantitativos**: botão na barra gera o relatório (imprimível/PDF/PNG); **CSV** exporta para planilha.
9. **Sol**: marque "Simular sombras"; **▶ Timelapse** anima o dia; **Sazonal** compara os solstícios.
10. **Terreno**: "Criar terreno" e esculpta com a ferramenta ⛰️ (Shift rebaixa) — curvas de nível aparecem na planta e a malha no 3D.
11. **Tipologias**: salve um pavimento como tipologia e estampe quantas unidades quiser clicando na planta.
12. **Versões**: alterações geram versões automáticas; restaure qualquer uma pelo painel.
10. **Iluminação/Ventilação/Memorial/Sazonal/Orçamento**: botões na barra geram os relatórios e estudos (imprimíveis/PDF/PNG; orçamento com preços editáveis + CSV).
5. **Objeto**: escolha o móvel/sanitário no painel Biblioteca e clique na planta para inserir; a rotação é editável nas propriedades.
6. **Medir**: clique o ponto inicial e arraste/clique o final — a distância aparece na planta.
7. **Corte**: traçe a linha de corte (2 cliques) e clique **Gerar corte** — abre modal com o corte seccionado, cotas verticais completas (níveis de pavimento, alturas piso-a-piso e alturas de portas/janelas). **Fachada ▾** abre menu com as 4 orientações.
8. **Planta PDF**: botão na barra superior gera a planta em prancha; no modal, escolha a escala no seletor e use **🖨️ Imprimir/PDF** ou **🖼️ PNG**.
8. Com **Selecionar**, clique num elemento para editar no painel de propriedades à direita.
9. **Exportar IFC**: gera um `.ifc` (IFC4) aberto em visualizadores BIM (BIMvision, usBIM, ArchiCAD, Revit).
5. Adicione pavimentos no painel direito; a vista 3D mostra todos empilhados.

## Limitações do MVP

- Aberturas no 3D interno são blocos sobrepostos (o vazamento real existe apenas no IFC exportado).
- O telhado no 3D é uma aproximação visual (duas águas); a altura recalcula pela inclinação alvo (%) no painel de propriedades; no IFC é exportado como laje plana.
- O corte/fachada é uma projeção simplificada (paredes e aberturas; sem esconder elementos atrás).
- Sem DWG, bibliotecas paramétricas externas (GDL/RFA) ou colaboração multiusuário.
