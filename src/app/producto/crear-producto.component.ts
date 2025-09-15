import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormArray } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { toast } from 'ngx-sonner';
import { ProductoService } from './producto.service';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ESaleType, EVatType, SaleTypeLabels, UnitMeasure, UnitMeasureLabels } from './producto';
import { CatalogService } from './catalog.service';
import { CurrencyFormatDirective } from '../directive/currency-format.directive';


@Component({
  selector: 'app-crear-producto',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, ReactiveFormsModule, CurrencyFormatDirective],
  templateUrl: './crear-producto.component.html',
  styleUrls: ['./crear-producto.component.css']
})
export class CrearProductoComponent implements OnInit {
  productoForm: FormGroup;
  isEditMode = false;
  idProducto?: string;

  saleTypes = Object.values(ESaleType);
  vatTypes = Object.values(EVatType);
  unitMeasures = Object.values(UnitMeasure);

  unitMeasureLabels = UnitMeasureLabels;
  saleTypeLabels = SaleTypeLabels;

  categories$ = this.catalogService.categories$;
  brands$ = this.catalogService.brands$;

  productCode$ = this.productoService.productCode$;

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

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.isEditMode = true;
        this.idProducto = id;
        this.loadProduct(id);
      }
    });

    this.productoService.productCode$.subscribe(code => {
      if (code) {
        this.productoForm.patchValue({ productCode: code });
      }
    });
  }

  get presentations(): FormArray {
    return this.productoForm.get('presentations') as FormArray;
  }

  addPresentation(presentation?: any) {
    if (this.presentations.length > 0) {
      let lastPresentation = this.presentations.at(this.presentations.length - 1);
      if (lastPresentation.invalid) {
        toast.warning('Complete la presentación antes de agregar una nueva.');
        return;
      }
    }
    this.presentations.push(this.fb.group({
      barcode: [presentation?.barcode || '', Validators.required],
      productCode: [presentation?.productCode || ''],
      label: [presentation?.label || '', Validators.required],
      salePrice: [presentation?.salePrice || 0, [Validators.required, Validators.min(0)]],
      costPrice: [presentation?.costPrice || 0, [Validators.required, Validators.min(0)]],
      unitMeasure: [presentation?.unitMeasure || '', Validators.required],
      conversionFactor: [presentation?.conversionFactor || 1, [Validators.min(0.01)]]
    }));
  }

  removePresentation(index: number) {
    this.presentations.removeAt(index);
  }

  loadProduct(id: string) {
    this.productoService.getProductByBarcode(id).subscribe({
      next: (product) => {
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
        this.presentations.clear();
        product.presentations.forEach((p: any) => this.addPresentation(p));
      },
      error: () => toast.error('No se pudo cargar el producto')
    });
  }

  submit() {
    if (this.productoForm.invalid) {
      toast.error('Formulario inválido');
      return;
    }
    const productData = this.productoForm.value;
    productData.presentations = productData.presentations.map((presentation: any) => ({
      ...presentation,
      productCode: this.productoForm.value.productCode,
      label: presentation.label.trim().toUpperCase(),
      salePrice: Number(presentation.salePrice.toString().replace("$ ","").replace(".","")),
      costPrice: Number(presentation.costPrice.toString().replace("$ ","").replace(".","")),
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
    if (index === 0) {
      const currentBarcode = this.presentations.at(index).get('barcode')?.value || '';
      const newBarcode = currentBarcode.trim() === '' ? undefined : currentBarcode.trim();
      if (currentBarcode.trim() === '') {
        this.productoService.getValidatedOrGenerateBarcode(newBarcode).subscribe({
          next: (validatedBarcode) => {
            this.presentations.at(index).get('barcode')?.setValue(validatedBarcode);
            toast.success('Código de barras generado: ' + validatedBarcode);
          },
          error: (err) => {
            toast.error('Error al generar el código de barras: ' + err.message);
            this.presentations.at(index).get('barcode')?.setValue('');
          }
        });
      }
    } else {
      let currentBarcode = this.presentations.at(index - 1).get('barcode')?.value || '';
      let newBarcode = parseInt(currentBarcode) + 1;
      this.presentations.at(index).get('barcode')?.setValue(newBarcode.toString());
    }
  }

  addCategory(newCategory: string) {
    if (newCategory.trim() === '' || newCategory.trim().length < 3) {
      toast.error('Ingrese un nombre válido para la categoría');
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

  addBrand(newBrand: string) {
    if (newBrand.trim() === '' || newBrand.trim().length < 3) {
      toast.error('Ingrese un nombre válido para la marca');
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
}
