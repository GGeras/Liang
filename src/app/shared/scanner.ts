import { Component, ElementRef, OnDestroy, output, signal, viewChild } from '@angular/core';
import { Icone } from './ui';

declare class BarcodeDetector {
  constructor(o?: { formats: string[] });
  detect(src: CanvasImageSource): Promise<{ rawValue: string }[]>;
  static getSupportedFormats(): Promise<string[]>;
}

/** Leitura de código de barras pela câmera (BarcodeDetector nativo do Android/Chrome). */
@Component({
  selector: 'app-scanner',
  imports: [Icone],
  template: `
    <dialog #dlg class="folha scanner" (close)="parar()" aria-labelledby="scanner-titulo">
      <div class="topo">
        <h2 id="scanner-titulo">Ler código de barras</h2>
        <button class="btn-icone" (click)="fechar()" aria-label="Fechar"><i-con nome="fechar" /></button>
      </div>
      @if (erro()) {
        <p class="erro-msg">{{ erro() }}</p>
      } @else {
        <div class="visor">
          <video #video playsinline muted></video>
          <div class="mira"></div>
        </div>
        <p class="muted small">Aponte a câmera para o código. Leitores USB/Bluetooth funcionam direto no campo de código.</p>
      }
    </dialog>
  `,
  styles: `
    .topo { display: flex; justify-content: space-between; align-items: center; margin-bottom: .75rem; }
    .visor { position: relative; border-radius: var(--r-md); overflow: hidden; background: #000; aspect-ratio: 4/3; margin-bottom: .75rem; }
    video { width: 100%; height: 100%; object-fit: cover; display: block; }
    .mira { position: absolute; inset: 35% 10%; border: 3px solid var(--label); border-radius: 8px; box-shadow: 0 0 0 999px rgb(0 0 0 / .35); }
  `,
})
export class Scanner implements OnDestroy {
  readonly lido = output<string>();
  readonly erro = signal('');
  private dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  private video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private stream?: MediaStream;
  private ativo = false;

  async abrir() {
    this.erro.set('');
    this.dlg().nativeElement.showModal();
    if (!('BarcodeDetector' in window)) {
      this.erro.set('Este navegador não lê códigos pela câmera. Use o Chrome no Android, um leitor físico, ou digite o código.');
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const v = this.video()!.nativeElement;
      v.srcObject = this.stream;
      await v.play();
      const det = new BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
      });
      this.ativo = true;
      const loop = async () => {
        if (!this.ativo) return;
        try {
          const r = await det.detect(v);
          if (r.length) {
            navigator.vibrate?.(60);
            this.lido.emit(r[0].rawValue);
            this.fechar();
            return;
          }
        } catch {
          /* quadro inválido, segue */
        }
        requestAnimationFrame(loop);
      };
      loop();
    } catch {
      this.erro.set('Não foi possível abrir a câmera. Verifique a permissão do navegador.');
    }
  }

  fechar() {
    this.dlg().nativeElement.close();
  }

  parar() {
    this.ativo = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
  }

  ngOnDestroy() {
    this.parar();
  }
}
