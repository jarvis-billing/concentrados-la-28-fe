import { Component, OnInit, AfterViewInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormArray } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { toast } from 'ngx-sonner';
import { ProductoService } from './producto.service';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ESaleType, EVatType, SaleTypeLabels, UnitMeasure, UnitMeasureLabels, DisplayStock } from './producto';
import { CatalogService } from './catalog.service';
import { CurrencyFormatDirective } from '../directive/currency-format.directive';
import { combineLatest } from 'rxjs';
import { take } from 'rxjs/operators';


@Component({
  selector: 'app-crear-producto',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, ReactiveFormsModule, CurrencyFormatDirective],
  templateUrl: './crear-producto.component.html',
  styleUrls: ['./crear-producto.component.css']
})
export class CrearProductoComponent implements OnInit, AfterViewInit {
  productoForm: FormGroup;
  isEditMode = false;
  idProducto?: string;
  // Stock legible del backend (packs/rollos) cuando estamos en modo edición
  loadedDisplayStock?: DisplayStock;

  saleTypes = Object.values(ESaleType);
  vatTypes = Object.values(EVatType);
  unitMeasures = Object.values(UnitMeasure);

  unitMeasureLabels = UnitMeasureLabels;
  saleTypeLabels = SaleTypeLabels;

  categories$ = this.catalogService.categories$;
  brands$ = this.catalogService.brands$;

  // Listas locales para asegurar que se muestre el valor seleccionado
  categoriesList: string[] = [];
  brandsList: string[] = [];

  productCode$ = this.productoService.productCode$;

  // Control de ayuda/tooltip por presentación (índices abiertos)
  private saleModeInfoOpen = new Set<number>();

  constructor(
    private fb: FormBuilder,
    private productoService: ProductoService,
    private router: Router,
    private route: ActivatedRoute,
    private catalogService: CatalogService,
  ) {
    this.productoForm = this.fb.group({
      description: ['', [Validators.required, Validators.maxLength(100)]],
      saleType: ['', Validators.required],
      brand: ['', Validators.required],
      category: ['', Validators.required],
      productCode: ['', Validators.required],
      vatValue: 0,
      vatType: [null],
      stock: this.fb.group({
        quantity: [0, [Validators.required, Validators.min(0)]],
        unitMeasure: ['', Validators.required]
      }),
      presentations: this.fb.array([])
    });
  }

  // Toma el mayor barcode (numérico) entre las presentaciones del formulario y devuelve el siguiente, preservando el padding
  private getNextBarcodeSeed(): string | null {
    try {
      const values: string[] = (this.presentations?.controls || [])
        .map(c => (c.get('barcode')?.value ?? '').toString().trim())
        .filter(v => v.length > 0);
      if (!values.length) return null;
      // Preferir el último no vacío, si hay varios
      const last = values[values.length - 1];
      // Si es numérico, incrementar preservando padding
      if (/^\d+$/.test(last)) {
        const width = last.length;
        const nextNum = (BigInt(last) + 1n).toString();
        return nextNum.padStart(width, '0');
      }
      // Si no es numérico, intentar encontrar el mayor numérico en la lista
      const numerics = values.filter(v => /^\d+$/.test(v)).map(v => BigInt(v));
      if (numerics.length) {
        const max = numerics.reduce((a, b) => (a > b ? a : b));
        const width = values.find(v => v === max.toString())?.length ?? max.toString().length;
        const nextNum = (max + 1n).toString();
        return nextNum.padStart(width, '0');
      }
      // Fallback: no numérico; intentar añadir sufijo incremental
      const base = last.replace(/\d+$/, '');
      const match = last.match(/(\d+)$/);
      if (match) {
        const width = match[1].length;
        const nextNum = (parseInt(match[1], 10) + 1).toString().padStart(width, '0');
        return base + nextNum;
      }
      return null;
    } catch {
      return null;
    }
  }

  ngAfterViewInit(): void {
    this.initTooltips();
  }

  private initTooltips() {
    try {
      const tooltipTriggerList = Array.from(document.querySelectorAll('[data-bs-toggle="tooltip"]')) as HTMLElement[];
      tooltipTriggerList.forEach((el) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Tip = (window as any)?.bootstrap?.Tooltip;
        if (Tip) new Tip(el);
      });
    } catch {
      // noop si bootstrap no está disponible aún
    }
  }

  // Devuelve los modos ya usados por otras presentaciones (excluye NORMAL)
  getUsedSaleModes(): Set<string> {
    const used = new Set<string>();
    this.presentations.controls.forEach((ctrl) => {
      const mode = (ctrl.get('saleMode')?.value || '') as string;
      if (mode && mode !== 'NORMAL') used.add(mode);
    });
    return used;
  }

  // Indica si un modo está disponible para la presentación i (permite mantener el modo ya seleccionado en i)
  isModeAvailable(mode: 'BULK'|'FIXED_HALF'|'FIXED_FULL'|'NORMAL', i: number): boolean {
    if (mode === 'NORMAL') return true;
    const ctrl = this.presentations.at(i);
    const current = ctrl.get('saleMode')?.value as string | null;
    const used = this.getUsedSaleModes();
    if (!used.has(mode)) return true;
    return current === mode; // disponible si es el que ya tiene seleccionado
  }

  // Toggle del texto de ayuda por presentación
  toggleSaleModeInfo(i: number) {
    if (this.saleModeInfoOpen.has(i)) this.saleModeInfoOpen.delete(i); else this.saleModeInfoOpen.add(i);
  }
  isSaleModeInfoOpen(i: number): boolean { return this.saleModeInfoOpen.has(i); }

  ngOnInit(): void {
    // Mantener listas locales sincronizadas con catálogos
    this.categories$.subscribe(cats => this.categoriesList = [...(cats || [])]);
    this.brands$.subscribe(br => this.brandsList = [...(br || [])]);

    this.route.paramMap.subscribe(params => {
      const barcode = params.get('barcode');
      if (barcode) {
        this.isEditMode = true;
        this.idProducto = barcode;
        this.loadProduct(barcode);
      }
    });

    // Fallback: si no viene barcode, intentar con query param 'id'
    this.route.queryParamMap.subscribe(qp => {
      const id = qp.get('id');
      if (id && !this.isEditMode) {
        this.isEditMode = true;
        this.idProducto = id;
        this.loadProductById(id);
      }
    });

    this.productoService.productCode$.subscribe(code => {
      if (code && !this.isEditMode) {
        this.productoForm.patchValue({ productCode: code });
      }
    });

    // Al entrar en modo creación, solicitar siempre un nuevo código de producto
    if (!this.isEditMode) {
      this.productoService.fetchProductCode();
    }
  }

  get presentations(): FormArray {
    return this.productoForm.get('presentations') as FormArray;
  }

  // Devuelve unidades permitidas según tipo de venta
  getAllowedUnitMeasures(): UnitMeasure[] {
    const saleType = this.productoForm.get('saleType')?.value as ESaleType | undefined;
    switch (saleType) {
      case ESaleType.WEIGHT:
        return [UnitMeasure.KILOGRAMOS];
      case ESaleType.UNIT:
        return [UnitMeasure.UNIDAD];
      case ESaleType.LONGITUDE:
        return [UnitMeasure.CENTIMETROS];
      case ESaleType.VOLUME:
        return [UnitMeasure.MILILITROS, UnitMeasure.LITROS];
      default:
        return this.unitMeasures as UnitMeasure[];
    }
  }

  isValidBasicData(): boolean | undefined {
    return this.productoForm.get('description')?.valid &&
      this.productoForm.get('saleType')?.valid &&
      this.productoForm.get('brand')?.valid &&
      this.productoForm.get('category')?.valid &&
      this.productoForm.get('productCode')?.valid &&
      this.productoForm.get('stock.quantity')?.valid &&
      this.productoForm.get('stock.unitMeasure')?.valid;
  }

  addPresentation(presentation?: any) {
    if (!this.isValidBasicData()) {
      toast.warning('Por favor, complete los datos básicos del producto antes de agregar una presentación.');
      return;
    }

    if (this.presentations.length > 0) {
      let lastPresentation = this.presentations.at(this.presentations.length - 1);
      if (lastPresentation.invalid) {
        toast.warning('Por favor, complete la presentación antes de agregar una nueva.');
        return;
      }
    }
    const group = this.fb.group({
      barcode: [presentation?.barcode || '', Validators.required],
      productCode: [presentation?.productCode || ''],
      label: [presentation?.label || '', Validators.required],
      salePrice: [presentation?.salePrice || 0, [Validators.required, Validators.min(0)]],
      costPrice: [presentation?.costPrice || 0, [Validators.required, Validators.min(0)]],
      unitMeasure: [presentation?.unitMeasure || '', Validators.required],
      // Nuevos flags explícitos por presentación
      isBulk: [presentation?.isBulk ?? false],
      isFixedAmount: [presentation?.isFixedAmount ?? false],
      fixedAmount: [presentation?.fixedAmount ?? null],
      // Tamaño del bulto (peso fijo) para calcular medio bulto o bulto completo
      packSize: [presentation?.fixedAmount ?? null],
      // Control de modo para UI (NORMAL | BULK | FIXED_HALF | FIXED_FULL)
      saleMode: [
        presentation?.isBulk
          ? 'BULK'
          : (presentation?.isFixedAmount ? 'FIXED_FULL' : 'NORMAL')
      ]
    });

    // Validación dinámica: fixedAmount requerido y > 0 cuando isFixedAmount = true
    const isFixedCtrl = group.get('isFixedAmount');
    const isBulkCtrl = group.get('isBulk');
    const fixedCtrl = group.get('fixedAmount');
    const packSizeCtrl = group.get('packSize');
    const saleModeCtrl = group.get('saleMode');
    const labelCtrl = group.get('label');
    const unitCtrl = group.get('unitMeasure');

    const buildAutoLabel = () => {
      const desc = (this.productoForm.get('description')?.value || '').toString().trim();
      const saleType = this.productoForm.get('saleType')?.value as ESaleType | undefined;
      const unitKey = unitCtrl?.value as keyof typeof UnitMeasureLabels;
      let unitLabel = (this.unitMeasureLabels as any)?.[unitKey] || unitKey || '';
      const mode = saleModeCtrl?.value as string | null;
      if (mode === 'BULK') {
        // Para volumen, representar siempre en mililitros
        if (saleType === ESaleType.VOLUME) {
          unitLabel = this.unitMeasureLabels[UnitMeasure.MILILITROS];
        }
        return `${desc} - GRANEL ${unitLabel}`.trim();
      }
      if (mode === 'FIXED_FULL' || mode === 'FIXED_HALF') {
        let size = Number(packSizeCtrl?.value) || 0;
        // Para FIXED_HALF, mostrar la mitad del tamaño
        let displaySize = mode === 'FIXED_HALF' ? size / 2 : size;
        // Convertir a mL cuando sea volumen
        if (saleType === ESaleType.VOLUME && displaySize > 0) {
          if (unitKey === UnitMeasure.LITROS) {
            displaySize = displaySize * 1000;
          }
          unitLabel = this.unitMeasureLabels[UnitMeasure.MILILITROS];
        }
        if (displaySize > 0) {
          const prefix = mode === 'FIXED_HALF' ? 'MEDIO BULTO' : 'BULTO COMPLETO';
          return `${desc} - ${prefix} ${displaySize} ${unitLabel}`.trim();
        }
        return desc;
      }
      return labelCtrl?.value;
    };
    
    const applyFixedValidators = (enabled: boolean) => {
      if (!fixedCtrl) return;
      if (enabled) {
        fixedCtrl.setValidators([Validators.required, Validators.min(0.01)]);
      } else {
        fixedCtrl.clearValidators();
        fixedCtrl.setValue(null);
      }
      fixedCtrl.updateValueAndValidity();
    };
    const applyPackSizeValidators = (enabled: boolean) => {
      if (!packSizeCtrl) return;
      if (enabled) {
        packSizeCtrl.setValidators([Validators.required, Validators.min(0.01)]);
      } else {
        packSizeCtrl.clearValidators();
        packSizeCtrl.setValue(null);
      }
      packSizeCtrl.updateValueAndValidity();
    };
    applyFixedValidators(!!isFixedCtrl?.value);
    isFixedCtrl?.valueChanges.subscribe((val: boolean) => applyFixedValidators(!!val));

    // Mantener flags sincronizados con saleMode (mutuamente excluyentes)
    saleModeCtrl?.valueChanges.subscribe((mode: string | null) => {
      if (!mode) {
        // reset a NORMAL si llega nulo
        isBulkCtrl?.setValue(false, { emitEvent: false });
        isFixedCtrl?.setValue(false, { emitEvent: false });
        applyFixedValidators(false);
        applyPackSizeValidators(false);
        return;
      }
      switch (mode) {
        case 'BULK':
          isBulkCtrl?.setValue(true, { emitEvent: false });
          isFixedCtrl?.setValue(false, { emitEvent: false });
          applyFixedValidators(false);
          applyPackSizeValidators(false);
          // Reset explícito de campos de pack
          packSizeCtrl?.setValue(null, { emitEvent: false });
          fixedCtrl?.setValue(null, { emitEvent: false });
          labelCtrl?.setValue(buildAutoLabel(), { emitEvent: false });
          break;
        case 'FIXED_HALF':
        case 'FIXED_FULL':
          isBulkCtrl?.setValue(false, { emitEvent: false });
          isFixedCtrl?.setValue(true, { emitEvent: false });
          applyFixedValidators(true);
          applyPackSizeValidators(true);
          // Derivar fixedAmount desde packSize
          const size = Number(packSizeCtrl?.value) || 0;
          if (size > 0) {
            // FIXED_HALF = mitad del tamaño, FIXED_FULL = tamaño completo
            const amount = mode === 'FIXED_HALF' ? size / 2 : size;
            fixedCtrl?.setValue(amount, { emitEvent: false });
          } else {
            fixedCtrl?.setValue(null, { emitEvent: false });
          }
          labelCtrl?.setValue(buildAutoLabel(), { emitEvent: false });
          break;
        default: // NORMAL
          isBulkCtrl?.setValue(false, { emitEvent: false });
          isFixedCtrl?.setValue(false, { emitEvent: false });
          applyFixedValidators(false);
          applyPackSizeValidators(false);
          // Reset explícito de campos de pack
          packSizeCtrl?.setValue(null, { emitEvent: false });
          fixedCtrl?.setValue(null, { emitEvent: false });
          labelCtrl?.setValue((labelCtrl?.value || '').toString(), { emitEvent: false });
      }
    });

    // Si cambia packSize con modo fijo seleccionado, recalcular fixedAmount
    packSizeCtrl?.valueChanges.subscribe((val) => {
      const mode = saleModeCtrl?.value as string | null;
      const size = Number(val) || 0;
      if (mode === 'FIXED_FULL' || mode === 'FIXED_HALF') {
        // FIXED_HALF = mitad del tamaño, FIXED_FULL = tamaño completo
        const amount = size > 0 ? (mode === 'FIXED_HALF' ? size / 2 : size) : null;
        fixedCtrl?.setValue(amount, { emitEvent: false });
      }
      if (mode === 'FIXED_FULL' || mode === 'FIXED_HALF') {
        labelCtrl?.setValue(buildAutoLabel(), { emitEvent: false });
      }
    });

    unitCtrl?.valueChanges.subscribe(() => {
      const mode = saleModeCtrl?.value as string | null;
      if (mode === 'BULK' || mode === 'FIXED_FULL' || mode === 'FIXED_HALF') {
        labelCtrl?.setValue(buildAutoLabel(), { emitEvent: false });
      }
    });

    this.presentations.push(group);
    // Re-inicializar tooltips porque el DOM cambió
    setTimeout(() => this.initTooltips());

    const saleType = this.productoForm.get('saleType')?.value;
    const lastIdx = this.presentations.length - 1;
    if (lastIdx >= 0) {
      const unitCtrl = this.presentations.at(lastIdx).get('unitMeasure');
      if (saleType === ESaleType.WEIGHT) {
        unitCtrl?.setValue(UnitMeasure.KILOGRAMOS);
      } else if (saleType === ESaleType.VOLUME) {
        unitCtrl?.setValue(UnitMeasure.LITROS);
      } else if (saleType === ESaleType.LONGITUDE) {
        unitCtrl?.setValue(UnitMeasure.CENTIMETROS);
      }
    }
  }

  removePresentation(index: number) {
    this.presentations.removeAt(index);
    setTimeout(() => this.initTooltips());
  }

  loadProduct(id: string) {
    this.productoService.getProductByBarcode(id).subscribe({
      next: (product) => this.patchProductWhenCatalogsReady(product),
      error: () => toast.error('No se pudo cargar el producto')
    });
  }

  loadProductById(id: string) {
    this.productoService.get(id).subscribe({
      error: () => toast.error('No se pudo cargar el producto por ID')
    });
  }

  private  patchProductWhenCatalogsReady(product: any) {
    combineLatest([this.categories$, this.brands$]).pipe(take(1)).subscribe(([cats, brands]) => {
      // Asegurar que existan opciones para la categoría y marca actual (evita que el select quede en blanco)
      const category = product.category;
      const brand = product.brand;
      const catsSafe = Array.isArray(cats) ? cats : [];
      const brandsSafe = Array.isArray(brands) ? brands : [];
      this.categoriesList = category && !catsSafe.includes(category) ? [...catsSafe, category] : [...catsSafe];
      this.brandsList = brand && !brandsSafe.includes(brand) ? [...brandsSafe, brand] : [...brandsSafe];

      this.productoForm.patchValue({
        description: product.description,
        saleType: product.saleType,
        brand: product.brand,
        category: product.category,
        productCode: product.productCode,
        vatValue: product.vatValue,
        vatType: product.vatType,
        stock: product.stock
      });
      // Guardar displayStock para mostrar badge informativo en la UI
      this.loadedDisplayStock = product?.displayStock;
      this.presentations.clear();
      (product.presentations || []).forEach((p: any) => this.addPresentation(p));
      // Ajustar saleMode y packSize en base a los fixedAmount existentes
      this.normalizeFixedModesFromForm();
    });
  }

  // Deduce saleMode (FIXED_FULL / FIXED_HALF) y packSize a partir de los fixedAmount ya guardados
  private normalizeFixedModesFromForm() {
    const ctrls = this.presentations.controls;
    if (!ctrls?.length) return;
    const saleType = this.productoForm.get('saleType')?.value;
    const fixedValues = ctrls
      .map(c => Number(c.get('fixedAmount')?.value) || 0)
      .filter(v => v > 0);
    if (!fixedValues.length) return;

    if (saleType !== ESaleType.WEIGHT) {
      // Para VOLUME y LONGITUDE: cualquier fijo es "Completo" y se reconstruye la etiqueta
      const desc = (this.productoForm.get('description')?.value || '').toString().trim();
      ctrls.forEach(c => {
        const isFixed = !!c.get('isFixedAmount')?.value;
        const isBulk = !!c.get('isBulk')?.value;
        const unitKey = c.get('unitMeasure')?.value as keyof typeof UnitMeasureLabels;
        const unitLabel = (this.unitMeasureLabels as any)?.[unitKey] || unitKey || '';
        const amt = Number(c.get('fixedAmount')?.value) || 0;
        if (isBulk) {
          c.get('saleMode')?.setValue('BULK');
          c.get('label')?.setValue(`${desc} - GRANEL ${unitLabel}`.trim(), { emitEvent: false });
          // bulk no usa packSize
          c.get('packSize')?.setValue(null, { emitEvent: false });
          return;
        }
        if (isFixed && amt > 0) {
          c.get('saleMode')?.setValue('FIXED_FULL');
          c.get('packSize')?.setValue(amt, { emitEvent: false });
          c.get('label')?.setValue(`${desc} ${amt} ${unitLabel}`.trim(), { emitEvent: false });
        }
      });
      return;
    }

    // Para WEIGHT conservar lógica de FULL/HALF
    const max = Math.max(...fixedValues);
    const eps = 1e-6;
    ctrls.forEach(c => {
      const isFixed = !!c.get('isFixedAmount')?.value;
      const amt = Number(c.get('fixedAmount')?.value) || 0;
      if (!isFixed || amt <= 0) {
        return;
      }
      if (Math.abs(amt - max) <= eps) {
        c.get('saleMode')?.setValue('FIXED_FULL');
        c.get('packSize')?.setValue(max, { emitEvent: false });
      } else if (Math.abs(amt - (max / 2)) <= eps) {
        c.get('saleMode')?.setValue('FIXED_HALF');
        c.get('packSize')?.setValue(max, { emitEvent: false });
      } else {
        c.get('saleMode')?.setValue('FIXED_FULL');
        c.get('packSize')?.setValue(amt, { emitEvent: false });
      }
    });
  }

  submit() {
    if (this.productoForm.invalid) {
      toast.warning('Por favor, diligencia los datos basicos y agrega minimo una presentación.');
      return;
    }
    const productData = this.productoForm.value;
    productData.presentations = productData.presentations.map((presentation: any) => ({
      ...presentation,
      productCode: this.productoForm.value.productCode,
      label: presentation.label.trim().toUpperCase(),
      salePrice: Number(presentation.salePrice),
      costPrice: Number(presentation.costPrice),
      // Enviar flags explícitos
      isBulk: !!presentation.isBulk,
      isFixedAmount: !!presentation.isFixedAmount,
      fixedAmount: presentation.isFixedAmount ? Number(presentation.fixedAmount) : null,
    }));

    if (this.isEditMode && this.idProducto) {
      this.productoService.update(productData, this.idProducto).subscribe({
        next: () => {
          toast.success('Producto editado correctamente');
          this.router.navigate(['/main/producto']);
        },
        error: () => toast.error('Error al editar el producto')
      });
    } else {
      this.productoService.create(productData).subscribe({
        next: () => {
          toast.success('Producto creado correctamente');
          this.router.navigate(['/main/producto']);
        },
        error: () => toast.error('Error al crear el producto')
      });
    }
  }

  cancelar() {
    this.router.navigate(['/main/producto']);
  }

  generateBarcode(index: number): void {
    const presentationControl = this.presentations.at(index);
    const currentBarcodeRaw = presentationControl.get('barcode')?.value || '';
    const trimmed = currentBarcodeRaw.toString().trim();
    // Si está vacío, intentar sembrar a partir del último barcode en el formulario
    const candidate = trimmed === '' ? (this.getNextBarcodeSeed() || undefined) : trimmed;

    this.productoService.getValidatedOrGenerateBarcode(candidate).subscribe({
      next: (validatedBarcode: string) => {
        presentationControl.get('barcode')?.setValue(validatedBarcode);
        toast.success('Código de barras listo: ' + validatedBarcode);
      },
      error: (err: any) => {
        toast.error('Error al validar/generar el código de barras: ' + (err?.message || err));
        presentationControl.get('barcode')?.setValue('');
      }
    });
  }

  addBrand(newBrand: string) {
    if (newBrand.trim() === '' || newBrand.trim().length < 3) {
      toast.warning('Por favor, ingrese un nombre válido para la marca');
      return;
    }

    this.catalogService.addBrand(newBrand).subscribe({
      next: () => toast.success('Marca agregada correctamente'),
      error: (error) => {
        console.error(error);
        toast.error('Error al agregar la marca')
      }
    });
  }

  addCategory(newCategory: string) {
    if (newCategory.trim() === '' || newCategory.trim().length < 3) {
      toast.warning('Por favor, ingrese un nombre válido para la categoría');
      return;
    }

    this.catalogService.addCategory(newCategory).subscribe({
      next: () => toast.success('Categoría agregada correctamente'),
      error: (error) => {
        console.error(error);
        toast.error('Error al agregar la categoría')
      }
    });
  }

  onSaleTypeChange(event: any) {
    const stockUnitMeasureControl = this.productoForm.get('stock.unitMeasure');
    stockUnitMeasureControl?.setValue(this.getUnitMeasureBySaleType());
    stockUnitMeasureControl?.updateValueAndValidity();
    stockUnitMeasureControl?.markAsTouched();

    // Actualizar las presentaciones existentes
    if (this.presentations.length > 0) {
      this.presentations.controls.forEach((presentationControl, index) => {
        const unitMeasureControl = presentationControl.get('unitMeasure');
        unitMeasureControl?.setValue(this.getUnitMeasureBySaleType());
        unitMeasureControl?.updateValueAndValidity();
        unitMeasureControl?.markAsTouched();
      });
    }
  }

  getUnitMeasureBySaleType(): UnitMeasure | '' {
    const saleType = this.productoForm.get('saleType')?.value;
    switch (saleType) {
      case ESaleType.WEIGHT:
        return UnitMeasure.KILOGRAMOS;
      case ESaleType.UNIT:
        return UnitMeasure.UNIDAD;
      case ESaleType.LONGITUDE:
        return UnitMeasure.CENTIMETROS;
      case ESaleType.VOLUME:
        return UnitMeasure.LITROS;
      default:
        return '';
    }
  }
}
