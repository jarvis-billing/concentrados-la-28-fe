import { Component, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { toast } from 'ngx-sonner';
import { StorageService } from '../services/localStorage.service';
import { ChangePasswordModalComponent } from '../auth/components/change-password-modal/change-password-modal.component';

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [RouterModule, ChangePasswordModalComponent],
  templateUrl: './menu.component.html'
})
export class MenuComponent {
  showChangePassword = false;

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

  openChangePassword(): void {
    this.closeMenu();
    this.showChangePassword = true;
  }

  closeMenu() {
    const navbarCollapse = document.querySelector('.navbar-collapse');
    if (navbarCollapse) {
      navbarCollapse.classList.remove('show');
    }
  }

}
