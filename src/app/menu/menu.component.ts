import { Component, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { toast } from 'ngx-sonner';
import { StorageService } from '../services/localStorage.service';
import { ChangePasswordModalComponent } from '../auth/components/change-password-modal/change-password-modal.component';
import { LoginUserService } from '../auth/login/loginUser.service';

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [RouterModule, ChangePasswordModalComponent],
  templateUrl: './menu.component.html'
})
export class MenuComponent {
  showChangePassword = false;

  router = inject(Router);
  private loginService = inject(LoginUserService);

  constructor(private localStorage: StorageService) {}

  get currentRole(): string {
    const user = this.loginService.getUserFromToken();
    // EUserRol serializa como "ROLE_ADMIN", "ROLE_FACTURADOR", etc. — normalizamos
    const raw: string = user?.rol ?? '';
    return raw.startsWith('ROLE_') ? raw.slice(5) : raw;
  }

  get isAdmin(): boolean { return this.currentRole === 'ADMIN'; }
  get isFacturador(): boolean { return this.currentRole === 'FACTURADOR'; }
  get isVendedor(): boolean { return this.currentRole === 'VENDEDOR'; }
  get isAdminOrFacturador(): boolean { return this.isAdmin || this.isFacturador; }

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
