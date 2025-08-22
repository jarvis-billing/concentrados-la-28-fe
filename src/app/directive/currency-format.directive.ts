import { Directive, ElementRef, EventEmitter, HostListener, Output } from '@angular/core';

@Directive({
  selector: '[appCurrencyFormat]',
  standalone: true
})
export class CurrencyFormatDirective {

  private el: HTMLInputElement;

  @Output() formattedValue = new EventEmitter<number>();

  constructor(private elementRef: ElementRef) {
    this.el = this.elementRef.nativeElement;
  }

  // Escucha cada vez que cambia el valor en el input
  @HostListener('input', ['$event.target.value'])
  onInput(value: string) {
    // Remover todos los caracteres que no sean números
    const numericValue = value.replace(/[^\d]/g, '');
    
    // Convertir a un número entero para evitar problemas de decimales
    const numberValue = parseInt(numericValue, 10);
    if (isNaN(numberValue)) {
      this.el.value = '';
      return;
    }
  
    // Formatear el valor numérico a pesos colombianos sin decimales
    this.el.value = new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(numberValue);

      // Emite el valor sin formato para cálculos
      this.formattedValue.emit(parseInt(numericValue, 10));
  }
  
}
