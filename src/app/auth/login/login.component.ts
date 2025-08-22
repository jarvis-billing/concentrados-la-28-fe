import { Component, inject } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { toast } from 'ngx-sonner';
import { LoginUserService } from './loginUser.service';
import { TokenLoginUser } from '../TokenLoginUser';
import { LoginUser } from './loginUser';
import { StorageService } from '../../services/localStorage.service';
import { ProductoService } from '../../producto/producto.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [RouterModule, FormsModule],
  templateUrl: './login.component.html'
})
export class LoginComponent {

  router = inject(Router);

  tokenLoginUser: TokenLoginUser = new TokenLoginUser();
  loginUser: LoginUser = new LoginUser();
  productService = inject(ProductoService);

  constructor(private loginService: LoginUserService, 
    private localStorage: StorageService
  ) {}

  onSubmit() { 
    toast.success('Sesion iniciada con éxito');
    this.router.navigate(['/main/inicio'])
  }

  login(formLogin: NgForm) {
    if (formLogin.invalid) {
      toast.error('Por favor, complete los datos de inicio de sesión.');
    } else {
      this.loginService.login(this.loginUser).subscribe({
        next: (response) => {
          this.tokenLoginUser = response;
          this.localStorage.set("authToken", this.tokenLoginUser.token);
          this.localStorage.set("tokenExpires", this.tokenLoginUser.expireIn);
          this.localStorage.set("tokenType", this.tokenLoginUser.type);

          //Cargar configuracion de los tipos de iva y alamacenarlos en el localstorage.
          this.productService.getAllVatProduct().subscribe({
            next: (vats) => {
              this.localStorage.set("allTypeVats", JSON.stringify(vats))
            }
          })
          
          formLogin.resetForm();
          toast.success('Bienvenido, haz iniciado sesion en Jarvis.');
          this.router.navigate(['/main/inicio'])
        },
        error: error => {
          const errorMessage = error.message ? error.message : error.error;
          if (errorMessage) {
            console.error(error);
            toast.error(errorMessage);
          } else {
            toast.error('Ocurrió un error al momento de iniciar sesion.');
          }
        }
      });

      
    }

  }

}
