import { Component, inject } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Product } from './producto';
import { toast } from 'ngx-sonner';
import { ProductoService } from './producto.service';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-crear-producto',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './crear-producto.component.html'
})
export class CrearProductoComponent {

  barcode: string = "";

  producto: Product = new Product();
  minPrecio: number = 1;
  maxPrecio: number = 10000000;
  idProducto?: string;

  constructor(private service: ProductoService, private route: ActivatedRoute) {}

  router= inject(Router);

  volverProducto() {
    this.router.navigate(['/main/producto'])
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      this.barcode = params.get('barcode') || '';
      console.log('Barcode recibido:', this.barcode);
      if(this.barcode != "") {
        this.producto.barcode = this.barcode;
        this.buscarProductoPorCodigoBarras();
      }
    });
  }

  guardarProducto(formulario: NgForm){
    if (formulario.invalid) {
      toast.error('El formulario es inválido');
    } else {
      this.service.create(this.producto).subscribe({
        next: () => {
          this.limpiarForm();
          formulario.resetForm();
          toast.success('Registro guardado correctamente');
        },
        error: error => {
          if (error.error) {
            toast.error(error.error.message);
          } else {
            toast.error('Ocurrió un error al crear el registro');
          }
        }
      });
    }
  }

  editarProducto(formulario: NgForm){
    if (formulario.invalid) {
      toast.error('El formulario es inválido');
    } else {
      this.service.update(this.producto, this.idProducto).subscribe({
        next: () => {
          this.limpiarForm();
          formulario.resetForm();
          toast.success('Registro editado correctamente');
        },
        error: error => {
          if (error.error.message) {
            toast.error(error.error.message);
          } else if(error.error) {
            toast.error(error.error.message);
          }else{
            toast.error('Ocurrió un error al editar el registro');
          }
        }
      });
    }
  }

  buscarProductoPorCodigoBarras() {
    if (this.producto.barcode !== undefined) {
      this.service.getProductByBarcode(this.producto.barcode).subscribe({
        next: res => {
          toast.warning("El producto ya existe y se editara.");
          this.producto = res;
          this.idProducto = res.id;
        }
      });
    }
  }

  limpiarForm() {
    this.idProducto = undefined;
    this.producto = new Product();
  }

}
