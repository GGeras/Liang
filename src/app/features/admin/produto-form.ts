import { Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { supabase, mensagemErro } from '../../core/supabase';
import { CatalogoService } from '../../core/catalogo.service';
import { AuthService } from '../../core/auth.service';
import { DataHoraPipe, Ident, Icone, Toast, formatarBRL, identTexto } from '../../shared/ui';
import { Scanner } from '../../shared/scanner';
import { Tipo } from './produtos';
import { IdiomaService } from '../../core/idioma.service';

interface Variacao {
  id: string;
  nome: string;
  preco_atacado: number | null;
  preco_varejo: number | null;
  custo: number | null;
  codigo_barras: string | null;
  estoque_minimo: number;
  ativo: boolean;
  nova?: boolean;
}

interface Alteracao {
  id: number;
  tabela: string;
  acao: 'criado' | 'alterado' | 'removido';
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  criado_em: string;
  perfis: { nome: string } | null;
}

const CAMPOS: Record<string, string> = {
  nome: 'nome', marca: 'marca', modelo: 'modelo', descricao: 'descrição', foto_url: 'foto', ativo: 'ativo',
  tipo_id: 'tipo', seq: 'número', preco_atacado: 'atacado', preco_varejo: 'varejo', custo: 'custo',
  codigo_barras: 'código de barras', estoque_minimo: 'estoque mínimo', status: 'situação', observacao: 'observação',
};
// Histórico em mandarim: a frase é montada aqui, então a tradução também
const CAMPOS_ZH: Record<string, string> = {
  nome: '名称', marca: '品牌', modelo: '型号', descricao: '描述', foto_url: '照片', ativo: '启用',
  tipo_id: '类别', seq: '编号', preco_atacado: '批发价', preco_varejo: '零售价', custo: '成本',
  codigo_barras: '条形码', estoque_minimo: '最低库存', status: '状态', observacao: '备注',
};
const PRECOS = new Set(['preco_atacado', 'preco_varejo', 'custo']);

interface Compat {
  id: string;
  modelo: string;
  status: 'confirmada' | 'a_confirmar';
  observacao: string | null;
  nova?: boolean;
}

@Component({
  selector: 'app-produto-form',
  imports: [FormsModule, RouterLink, Ident, Icone, DataHoraPipe, Scanner],
  template: `
    <main class="pagina">
      <header class="cabecalho">
        <a class="btn-icone" routerLink="/admin/produtos" aria-label="Voltar"><i-con nome="voltar" /></a>
        <h1 class="titulo">{{ novo() ? 'Novo produto' : 'Editar produto' }}</h1>
        <app-ident [codigo]="modo() === 'codigo' ? codigo() : null" [barras]="modo() === 'barras' ? variacoes()[0]?.codigo_barras : null" />
      </header>

      @if (erro()) {
        <p class="erro-msg">{{ erro() }}</p>
      }

      <section class="painel form">
        <h2>Identificação</h2>
        <!-- É um ou outro: produto com código de barras não usa 00-00 -->
        <div class="segmento" role="group" aria-label="Como o produto é identificado">
          <button type="button" [attr.aria-pressed]="modo() === 'barras'" (click)="mudarModo('barras')">Código de barras</button>
          <button type="button" [attr.aria-pressed]="modo() === 'codigo'" (click)="mudarModo('codigo')">Sem código (00-00)</button>
        </div>
        <p class="muted small">
          {{ modo() === 'barras'
            ? 'Leia o código de barras do produto e complete o resto. Se houver mais de uma variação (cor, qualidade), cada uma tem o seu código.'
            : 'Para peça sem código de barras: o sistema identifica pelo código 00-00 (tipo + número).' }}
        </p>
        @if (modo() === 'barras' && variacoes()[0]; as v0) {
          <!-- Código de barras da 1ª variação, no topo: ler e terminar de preencher -->
          <div class="campo">
            <span id="cb-principal">Código de barras{{ variacoes().length > 1 ? ' · ' + (v0.nome || '1ª variação') : '' }}</span>
            <div class="cb-linha">
              <input inputmode="numeric" autocomplete="off" aria-labelledby="cb-principal" [(ngModel)]="v0.codigo_barras" placeholder="Leia ou digite" />
              <button type="button" class="btn sec cb-camera" (click)="lerCodigoPara(v0)" aria-label="Ler código de barras com a câmera"><i-con nome="scan" /></button>
            </div>
          </div>
        }
        <div class="grade2">
          <label class="campo" [class.span2]="modo() === 'barras'">
            <span>Tipo</span>
            <select [ngModel]="tipoId()" (ngModelChange)="mudarTipo($event)">
              <option [ngValue]="null" disabled>Escolha</option>
              @for (t of tipos(); track t.id) {
                <option [ngValue]="t.id">{{ pad(t.id) }} · {{ t.nome }}</option>
              }
            </select>
          </label>
          @if (modo() === 'codigo') {
            <label class="campo">
              <span>Número no tipo</span>
              <input type="number" min="0" max="99" inputmode="numeric" [ngModel]="seq()" (ngModelChange)="seq.set($event)" />
            </label>
          }
        </div>
        @if (!tipos().length) {
          <p class="muted small">Cadastre os tipos primeiro em Produtos › Tipos.</p>
        }
      </section>

      <section class="painel form">
        <h2>Produto</h2>
        <label class="campo"><span>Nome</span><textarea class="nome-campo" rows="2" [ngModel]="nome()" (ngModelChange)="nome.set($event)" placeholder="Ex.: Tela iPhone 11"></textarea></label>
        <div class="grade2">
          <label class="campo"><span>Marca</span><input [ngModel]="marca()" (ngModelChange)="marca.set($event)" /></label>
          <label class="campo"><span>Modelo</span><input [ngModel]="modelo()" (ngModelChange)="modelo.set($event)" /></label>
        </div>
        <label class="campo"><span>Descrição</span><textarea [ngModel]="descricao()" (ngModelChange)="descricao.set($event)"></textarea></label>
        <div class="foto">
          @if (fotoUrl()) {
            <img [src]="fotoUrl()" alt="Foto do produto" />
          }
          <label class="btn sec pequeno">
            {{ enviandoFoto() ? 'Enviando…' : fotoUrl() ? 'Trocar foto' : 'Adicionar foto' }}
            <input type="file" accept="image/*" capture="environment" hidden (change)="enviarFoto($event)" />
          </label>
          @if (fotoUrl()) {
            <button class="btn-icone" (click)="fotoUrl.set(null)" aria-label="Remover foto"><i-con nome="apagar" /></button>
          }
        </div>
        <label class="ativo"><input type="checkbox" [ngModel]="ativo()" (ngModelChange)="ativo.set($event)" /> Produto ativo (aparece para venda)</label>
      </section>

      <section class="painel form">
        <div class="titulo-acao">
          <h2>Variações e preços</h2>
          <button class="btn sec pequeno" (click)="addVariacao()"><i-con nome="mais1" /> Variação</button>
        </div>
        <p class="muted small">Cor ou qualidade (Incell, OLED, JK…). Cada variação tem preço e estoque próprios. Use "Padrão" se não houver.</p>
        @for (v of variacoes(); track v.id; let idx = $index) {
          <fieldset class="variacao" [class.inativa]="!v.ativo">
            <div class="grade2">
              @if (modo() === 'barras' && idx > 0) {
                <!-- Produto com código de barras: o código é a identificação de cada variação -->
                <div class="campo span2">
                  <span [id]="'cb-rotulo-' + v.id">Código de barras</span>
                  <div class="cb-linha">
                    <input inputmode="numeric" autocomplete="off" [attr.aria-labelledby]="'cb-rotulo-' + v.id" [(ngModel)]="v.codigo_barras" placeholder="Leia ou digite" />
                    <button type="button" class="btn sec cb-camera" (click)="lerCodigoPara(v)" [attr.aria-label]="'Ler código de barras da variação ' + (v.nome || 'nova') + ' com a câmera'"><i-con nome="scan" /></button>
                  </div>
                </div>
              }
              <label class="campo span2"><span>Nome da variação</span><input [(ngModel)]="v.nome" /></label>
              <label class="campo"><span>Preço atacado</span><input type="number" min="0" step="0.01" inputmode="decimal" [(ngModel)]="v.preco_atacado" /></label>
              <label class="campo"><span>Preço varejo</span><input type="number" min="0" step="0.01" inputmode="decimal" [(ngModel)]="v.preco_varejo" /></label>
              <label class="campo"><span>Custo (opcional)</span><input type="number" min="0" step="0.01" inputmode="decimal" [(ngModel)]="v.custo" /></label>
              <label class="campo"><span>Estoque mínimo</span><input type="number" min="0" inputmode="numeric" [(ngModel)]="v.estoque_minimo" /></label>
            </div>
            <div class="rodape-var">
              <label class="ativo"><input type="checkbox" [(ngModel)]="v.ativo" /> Ativa</label>
              @if (v.nova && variacoes().length > 1) {
                <button class="btn-icone" (click)="removerVariacao(idx)" aria-label="Remover variação"><i-con nome="apagar" /></button>
              }
            </div>
          </fieldset>
        }
        <p class="muted small">Variações com histórico não são apagadas, apenas desativadas.</p>
      </section>

      <section class="painel form">
        <h2>Compatibilidades</h2>
        <p class="muted small">Só as confirmadas aparecem para o vendedor. Sugestões entram como "a confirmar".</p>
        <ul class="compat">
          @for (c of compat(); track c.id; let idx = $index) {
            <li>
              <div class="compat-linha">
                <strong>{{ c.modelo }}</strong>
                <button class="selo" [class.ok]="c.status === 'confirmada'" [class.alerta]="c.status === 'a_confirmar'" (click)="alternarStatus(c)">
                  {{ c.status === 'confirmada' ? 'Confirmada' : 'A confirmar' }}
                </button>
                <button class="btn-icone" (click)="removerCompat(idx)" [attr.aria-label]="'Remover ' + c.modelo"><i-con nome="apagar" /></button>
              </div>
              <input class="input obs" [(ngModel)]="c.observacao" placeholder="Observação (opcional)" [attr.aria-label]="'Observação sobre ' + c.modelo" />
            </li>
          } @empty {
            <li class="muted small">Nenhuma compatibilidade anotada.</li>
          }
        </ul>
        <div class="add-compat">
          <input class="input" [ngModel]="novoModelo()" (ngModelChange)="novoModelo.set($event)" (keydown.enter)="addCompat()" placeholder="Ex.: iPhone XR" aria-label="Novo modelo compatível" />
          <button class="btn" (click)="addCompat()" [disabled]="!novoModelo().trim()">Adicionar</button>
        </div>
      </section>

      @if (historico().length) {
        <section class="painel form">
          <h2>Histórico de alterações</h2>
          <ul class="hist">
            @for (h of historico(); track h.id) {
              <li>
                <span class="muted small">{{ h.criado_em | dataHora }} · {{ h.perfis?.nome ?? 'Sistema' }}</span>
                <span>{{ descrever(h) }}</span>
              </li>
            }
          </ul>
        </section>
      }

      <button class="btn bloco salvar" (click)="salvar()" [disabled]="salvando() || !valido()">{{ salvando() ? 'Salvando…' : 'Salvar produto' }}</button>
      @if (!valido()) {
        <p class="muted small centro">
          {{ modo() === 'barras'
            ? 'Preencha tipo, nome, o código de barras e os preços de cada variação.'
            : 'Preencha tipo, número, nome e os preços de cada variação.' }}
        </p>
      }
    </main>

    <app-scanner #scanner (lido)="codigoLido($event)" />
  `,
  styles: `
    .titulo { flex: 1; font-size: 1.3rem; min-width: 0; }
    .campo textarea.nome-campo { min-height: 0; resize: none; field-sizing: content; }
    .form { display: grid; gap: .9rem; }
    .grade2 { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; }
    .span2 { grid-column: 1 / -1; }
    .foto { display: flex; align-items: center; gap: .75rem; }
    .foto img { width: 72px; height: 72px; object-fit: cover; border-radius: var(--r-md); background: var(--paper); }
    .ativo { display: flex; align-items: center; gap: .5rem; font-weight: 600; }
    .ativo input { width: 20px; height: 20px; accent-color: var(--cobalt); }
    .titulo-acao { display: flex; justify-content: space-between; align-items: center; gap: .75rem; flex-wrap: wrap; }
    .variacao { border: 1.5px solid var(--line); border-radius: var(--r-md); padding: .9rem; margin: 0; display: grid; gap: .75rem; }
    .variacao.inativa { border-style: dashed; background: var(--paper); }
    .rodape-var { display: flex; justify-content: space-between; align-items: center; }
    .cb-linha { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .5rem; }
    /* "Código de barras | Sem código (00-00)" quebra linha em 320px em vez de estourar */
    .form .segmento button { white-space: normal; line-height: 1.2; padding-block: .4rem; min-width: 0; }
    .cb-camera { width: 48px; padding: 0; }
    .compat { list-style: none; padding: 0; margin: 0; display: grid; gap: .8rem; }
    .compat-linha { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: .5rem; align-items: center; }
    .compat .selo { border: 0; cursor: pointer; font: inherit; font-size: .78rem; font-weight: 700; }
    .obs { min-height: 40px; margin-top: .35rem; font-size: .9rem; }
    .add-compat { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .5rem; }
    .salvar { position: sticky; bottom: calc(var(--nav-h) + var(--safe-b) + .75rem); box-shadow: 0 6px 18px rgb(35 64 200 / .3); }
    .centro { text-align: center; }
    .hist { list-style: none; margin: 0; padding: 0; display: grid; gap: .6rem; font-size: .92rem; }
    .hist li { display: grid; padding-bottom: .6rem; border-bottom: 1px solid var(--line); }
    .hist li:last-child { border-bottom: 0; padding-bottom: 0; }
  `,
})
export class ProdutoForm {
  readonly id = input<string>();
  /** `?barras=...`: novo produto já com o código lido em Vender/Estoque. */
  readonly barras = input<string>();
  private scanner = viewChild.required(Scanner);
  private alvoLeitura: Variacao | null = null;
  private router = inject(Router);
  private toast = inject(Toast);
  private idioma = inject(IdiomaService);
  private catalogo = inject(CatalogoService);
  private auth = inject(AuthService);

  protected produtoId = signal(crypto.randomUUID());
  protected novo = computed(() => !this.id());
  protected tipos = signal<Tipo[]>([]);
  protected tipoId = signal<number | null>(null);
  protected seq = signal<number | null>(null);
  protected nome = signal('');
  protected marca = signal('');
  protected modelo = signal('');
  protected descricao = signal('');
  protected fotoUrl = signal<string | null>(null);
  protected ativo = signal(true);
  protected variacoes = signal<Variacao[]>([this.variacaoVazia('Padrão')]);
  protected compat = signal<Compat[]>([]);
  private compatRemovidas: string[] = [];
  protected novoModelo = signal('');
  protected salvando = signal(false);
  protected enviandoFoto = signal(false);
  protected erro = signal('');
  protected historico = signal<Alteracao[]>([]);

  /** Novo produto começa por código de barras (a maioria das peças tem). */
  protected modo = signal<'barras' | 'codigo'>('barras');

  protected codigo = computed(() =>
    this.tipoId() === null ? '00-00' : `${this.pad(this.tipoId()!)}-${this.seq() === null ? '__' : this.pad(Number(this.seq()))}`,
  );

  constructor() {
    queueMicrotask(() => this.carregar());
  }

  protected pad(n: number) {
    return String(n).padStart(2, '0');
  }

  private variacaoVazia(nome = ''): Variacao {
    return { id: crypto.randomUUID(), nome, preco_atacado: null, preco_varejo: null, custo: null, codigo_barras: null, estoque_minimo: 0, ativo: true, nova: true };
  }

  /** Ou o produto tem código de barras (em cada variação), ou tem 00-00. Nunca os dois. */
  protected mudarModo(m: 'barras' | 'codigo') {
    this.modo.set(m);
    if (m === 'codigo' && this.novo() && this.seq() === null && this.tipoId() !== null) this.mudarTipo(this.tipoId()!);
  }

  protected valido() {
    const s = Number(this.seq());
    const identificado =
      this.modo() === 'codigo'
        ? this.seq() !== null && (this.seq() as unknown) !== '' && s >= 0 && s <= 99
        : this.variacoes().every((v) => !!v.codigo_barras?.toString().trim());
    return (
      this.tipoId() !== null &&
      identificado &&
      !!this.nome().trim() &&
      this.variacoes().length > 0 &&
      this.variacoes().every((v) => v.nome.trim() && v.preco_atacado !== null && v.preco_varejo !== null && (v.preco_atacado as unknown) !== '' && (v.preco_varejo as unknown) !== '')
    );
  }

  private async carregar() {
    const t = await supabase.from('tipos').select('id, nome').order('id');
    this.tipos.set((t.data ?? []) as Tipo[]);
    const id = this.id();
    if (!id) {
      const barras = this.barras()?.trim();
      if (barras && this.aceitarCodigo(barras, this.variacoes()[0])) {
        this.variacoes()[0].codigo_barras = barras;
        this.variacoes.update((l) => [...l]);
      }
      return;
    }
    const { data, error } = await supabase
      .from('produtos')
      .select('*, variacoes(id, nome, preco_atacado, preco_varejo, codigo_barras, estoque_minimo, ativo), compatibilidades(*)')
      .eq('id', id)
      .single();
    if (error) return this.erro.set(mensagemErro(error));
    // Custo não é legível pela tabela (só admin, por função)
    const custos = await supabase.rpc('custos_variacoes', { p_produto: id });
    if (custos.error) return this.erro.set(mensagemErro(custos.error));
    const custoDe = new Map(((custos.data ?? []) as { variacao_id: string; custo: number | null }[]).map((c) => [c.variacao_id, c.custo]));
    for (const v of data.variacoes as Variacao[]) v.custo = custoDe.get(v.id) ?? null;
    this.produtoId.set(data.id);
    this.tipoId.set(data.tipo_id);
    this.seq.set(data.seq);
    this.modo.set(data.seq === null ? 'barras' : 'codigo');
    this.nome.set(data.nome);
    this.marca.set(data.marca ?? '');
    this.modelo.set(data.modelo ?? '');
    this.descricao.set(data.descricao ?? '');
    this.fotoUrl.set(data.foto_url);
    this.ativo.set(data.ativo);
    this.variacoes.set((data.variacoes as Variacao[]).sort((a, b) => a.nome.localeCompare(b.nome)));
    this.compat.set((data.compatibilidades as Compat[]).sort((a, b) => a.modelo.localeCompare(b.modelo)));
    const ids = [data.id, ...(data.variacoes as Variacao[]).map((v) => v.id), ...(data.compatibilidades as Compat[]).map((c) => c.id)];
    const h = await supabase
      .from('alteracoes_catalogo')
      .select('id, tabela, acao, antes, depois, criado_em, perfis(nome)')
      .in('registro_id', ids)
      .order('criado_em', { ascending: false })
      .limit(30);
    this.historico.set((h.data ?? []) as unknown as Alteracao[]);
  }

  /** "Variação Incell: varejo R$ 120,00 → R$ 150,00" */
  protected descrever(h: Alteracao): string {
    const zh = this.idioma.idioma() === 'zh-CN';
    const reg = h.depois ?? h.antes ?? {};
    const alvo =
      h.tabela === 'variacoes'
        ? `${zh ? '规格' : 'Variação'} ${reg['nome']}`
        : h.tabela === 'compatibilidades'
          ? `${zh ? '适用机型' : 'Compatível'} ${reg['modelo']}`
          : zh ? '商品' : 'Produto';
    const dois = zh ? '：' : ': ';
    if (h.acao === 'criado') return alvo + dois + (zh ? (h.tabela === 'compatibilidades' ? '已添加' : '已新增') : 'cadastrado');
    if (h.acao === 'removido') return alvo + dois + (zh ? '已删除' : 'removido');
    const fmt = (k: string, v: unknown) =>
      v === null || v === undefined || v === ''
        ? (zh ? '空' : 'vazio')
        : PRECOS.has(k) ? formatarBRL(v as number)
        : typeof v === 'boolean' ? (zh ? (v ? '是' : '否') : v ? 'sim' : 'não')
        : String(v);
    const campo = (k: string) => (zh ? CAMPOS_ZH[k] : CAMPOS[k]);
    const mud = Object.keys(CAMPOS)
      .filter((k) => JSON.stringify(h.antes?.[k]) !== JSON.stringify(h.depois?.[k]))
      .map((k) =>
        k === 'descricao' || k === 'foto_url'
          ? `${campo(k)}${zh ? '已修改' : ' alterada'}`
          : `${campo(k)} ${fmt(k, h.antes?.[k])} → ${fmt(k, h.depois?.[k])}`,
      );
    return alvo + dois + (mud.join(zh ? '；' : '; ') || (zh ? '已修改' : 'alterado'));
  }

  /** Ao escolher o tipo num produto novo, sugere o próximo número livre. */
  protected async mudarTipo(t: number) {
    this.tipoId.set(t);
    if (!this.novo()) return;
    const { data } = await supabase.from('produtos').select('seq').eq('tipo_id', t);
    const usados = new Set((data ?? []).map((d) => d.seq));
    let s = 1;
    while (usados.has(s) && s < 99) s++;
    this.seq.set(usados.has(s) ? null : s);
    if (usados.size >= 99) this.toast.mostrar('Este tipo já está quase cheio. Considere criar um segundo tipo.', 'info', 6000);
  }

  /** Abre a câmera para preencher o código de barras desta variação. */
  protected lerCodigoPara(v: Variacao) {
    this.alvoLeitura = v;
    this.scanner().abrir();
  }

  protected codigoLido(codigo: string) {
    const v = this.alvoLeitura;
    this.alvoLeitura = null;
    if (!v || !this.aceitarCodigo(codigo, v)) return;
    v.codigo_barras = codigo.trim();
    this.variacoes.update((l) => [...l]);
    this.toast.mostrar(`Código ${codigo.trim()} lido`, 'ok', 2000);
  }

  /** O mesmo código não pode estar em duas variações (o banco também recusa). */
  private aceitarCodigo(codigo: string, v: Variacao): boolean {
    const c = codigo.trim();
    const noCatalogo = this.catalogo.buscarBarras(c);
    if (noCatalogo && noCatalogo.variacao_id !== v.id) {
      this.toast.mostrar(`Esse código já está em ${identTexto(noCatalogo.codigo, null) || 'outro produto:'} ${noCatalogo.nome} · ${noCatalogo.variacao}.`, 'erro', 6000);
      return false;
    }
    const nesteProduto = this.variacoes().find((x) => x !== v && x.codigo_barras?.toString().trim() === c);
    if (nesteProduto) {
      this.toast.mostrar(`Esse código já está na variação ${nesteProduto.nome || 'nova'} deste produto.`, 'erro', 6000);
      return false;
    }
    return true;
  }

  protected addVariacao() {
    this.variacoes.update((l) => [...l, this.variacaoVazia()]);
  }

  protected removerVariacao(i: number) {
    this.variacoes.update((l) => l.filter((_, x) => x !== i));
  }

  protected addCompat() {
    const m = this.novoModelo().trim();
    if (!m) return;
    if (this.compat().some((c) => c.modelo.toLowerCase() === m.toLowerCase())) {
      this.toast.mostrar('Esse modelo já está na lista.', 'erro');
      return;
    }
    // Anotado pelo admin: entra como confirmado; pode alternar para "a confirmar"
    this.compat.update((l) => [...l, { id: crypto.randomUUID(), modelo: m, status: 'confirmada', observacao: null, nova: true }]);
    this.novoModelo.set('');
  }

  protected alternarStatus(c: Compat) {
    this.compat.update((l) => l.map((x) => (x === c ? { ...x, status: x.status === 'confirmada' ? 'a_confirmar' : 'confirmada' } : x)));
  }

  protected removerCompat(i: number) {
    const c = this.compat()[i];
    if (!c.nova) this.compatRemovidas.push(c.id);
    this.compat.update((l) => l.filter((_, x) => x !== i));
  }

  protected async enviarFoto(ev: Event) {
    const arq = (ev.target as HTMLInputElement).files?.[0];
    if (!arq) return;
    this.enviandoFoto.set(true);
    try {
      const blob = await reduzirImagem(arq, 1000);
      const caminho = `${this.produtoId()}/${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('produtos').upload(caminho, blob, { contentType: 'image/jpeg' });
      if (error) throw error;
      this.fotoUrl.set(supabase.storage.from('produtos').getPublicUrl(caminho).data.publicUrl);
    } catch (e) {
      this.toast.mostrar(mensagemErro(e), 'erro');
    } finally {
      this.enviandoFoto.set(false);
    }
  }

  protected async salvar() {
    this.erro.set('');
    this.salvando.set(true);
    const vazio = (s: string) => s.trim() || null;
    const num = (v: unknown) => (v === null || v === '' || v === undefined ? null : Number(v));
    try {
      // Uma transação só no servidor: ou salva produto, variações e compatibilidades, ou nada
      const { error } = await supabase.rpc('salvar_produto', {
        p_produto: {
          id: this.produtoId(),
          tipo_id: this.tipoId(),
          // É um ou outro: com código de barras não há número 00-00
          seq: this.modo() === 'codigo' ? Number(this.seq()) : null,
          nome: this.nome().trim(),
          marca: vazio(this.marca()),
          modelo: vazio(this.modelo()),
          descricao: vazio(this.descricao()),
          foto_url: this.fotoUrl(),
          ativo: this.ativo(),
        },
        p_variacoes: this.variacoes().map((x) => ({
          id: x.id,
          nome: x.nome.trim(),
          preco_atacado: num(x.preco_atacado),
          preco_varejo: num(x.preco_varejo),
          custo: num(x.custo),
          codigo_barras: this.modo() === 'barras' ? x.codigo_barras?.toString().trim() || null : null,
          estoque_minimo: num(x.estoque_minimo) ?? 0,
          ativo: x.ativo,
        })),
        p_compat: this.compat().map((x) => ({
          id: x.id,
          modelo: x.modelo,
          status: x.status,
          observacao: x.observacao?.trim() || null,
        })),
        p_compat_remover: this.compatRemovidas,
      });
      if (error) throw error;
      this.compatRemovidas = [];

      this.toast.mostrar(`Produto ${this.modo() === 'codigo' ? this.codigo() : this.nome().trim()} salvo`, 'ok');
      await this.catalogo.atualizar();
      this.router.navigateByUrl('/admin/produtos');
    } catch (e) {
      this.erro.set(mensagemErro(e));
      scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      this.salvando.set(false);
    }
  }
}

/** Reduz a foto no próprio celular antes de enviar (economiza dados e armazenamento). */
async function reduzirImagem(arq: File, max: number): Promise<Blob> {
  const img = await createImageBitmap(arq);
  const escala = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * escala);
  c.height = Math.round(img.height * escala);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob((b) => ok(b!), 'image/jpeg', 0.82));
}
