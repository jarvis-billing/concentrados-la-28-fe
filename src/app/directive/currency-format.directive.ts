import { Directive, ElementRef, HostListener, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Directive({
  selector: '[appCurrencyFormat]',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CurrencyFormatDirective),
      multi: true,
    },
  ],
})
export class CurrencyFormatDirective implements ControlValueAccessor {

  private el: HTMLInputElement;
  private onChange: (value: number | null) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private elementRef: ElementRef) {
    this.el = this.elementRef.nativeElement;
  }

  writeValue(value: any): void {
    // Formatea cuando el modelo escribe (incluye valores iniciales o patchValue)
    if (value === null || value === undefined || value === '') {
      this.el.value = '';
      return;
    }
    const numberValue = this.toNumber(value);
    if (numberValue === null) {
      this.el.value = '';
      return;
    }
    this.el.value = this.formatCOP(numberValue);
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.el.disabled = isDisabled;
  }

  @HostListener('input', ['$event.target.value'])
  onInput(value: string) {
    const numberValue = this.toNumber(value);
    if (numberValue === null) {
      this.el.value = '';
      this.onChange(null);
      return;
    }
    // Re-formatear lo que el usuario escribe y propagar número puro al modelo
    this.el.value = this.formatCOP(numberValue);
    this.onChange(numberValue);
  }

  @HostListener('blur')
  onBlur() {
    this.onTouched();
  }

  private toNumber(value: any): number | null {
    if (typeof value === 'number') {
      return isNaN(value) ? null : Math.trunc(value);
    }
    const str = String(value ?? '').trim();
    if (!str) return null;
    const numeric = str.replace(/[^\d]/g, '');
    if (!numeric) return null;
    const n = parseInt(numeric, 10);
    return isNaN(n) ? null : n;
  }

  private formatCOP(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.trunc(value));
  }
  
}
