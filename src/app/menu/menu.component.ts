import { Component, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { toast } from 'ngx-sonner';
import { StorageService } from '../services/localStorage.service';

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './menu.component.html'
})
export class MenuComponent {

  router= inject(Router);

  constructor(private localStorage: StorageService) { }

  logoutHandler() {
    toast('Esta seguro que quiere cerrar sesión?', {
      action: {
        label: 'Confirmar',
        onClick: () => {
          this.router.navigate(['/login'])
          this.localStorage.allClearItems();
          toast.success('Sesion cerrada con éxito');
        }
      },
    });
  }

  closeMenu() {
    const navbarCollapse = document.querySelector('.navbar-collapse');
    if (navbarCollapse) {
      navbarCollapse.classList.remove('show');
    }
  }

}
