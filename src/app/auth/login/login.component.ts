import { Component, inject, OnInit } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
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
export class LoginComponent implements OnInit {

  router = inject(Router);
  route = inject(ActivatedRoute);

  tokenLoginUser: TokenLoginUser = new TokenLoginUser();
  loginUser: LoginUser = new LoginUser();
  productService = inject(ProductoService);
  currentYear = new Date().getFullYear();
  returnUrl = '/main/inicio';

  constructor(private loginService: LoginUserService,
    private localStorage: StorageService
  ) {}

  ngOnInit(): void {
    const qReturn = this.route.snapshot.queryParamMap.get('returnUrl');
    if (qReturn) {
      this.returnUrl = qReturn;
    }
  }

  onSubmit() {
    toast.success('Sesion iniciada con éxito');
    this.router.navigateByUrl(this.returnUrl);
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
          const payload = this.tokenLoginUser.token.split('.')[1];
          const user = JSON.parse(atob(payload));
          const sub = user?.sub;
          const rol: string = (sub ? user[sub]?.rol : '') || '';
          const destination = rol.includes('VENDEDOR') ? '/preventa' : this.returnUrl;
          this.router.navigateByUrl(destination);
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
