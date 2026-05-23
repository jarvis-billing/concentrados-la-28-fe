import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { toast } from 'ngx-sonner';
import { UserService } from '../../../users/user.service';
import { ChangePasswordRequest, CreateUserRequest, UpdateUserRequest, User, USER_ROLES } from '../../../auth/user';
import { LoginUserService } from '../../../auth/login/loginUser.service';

@Component({
  selector: 'app-users-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './users-page.component.html',
  styleUrl: './users-page.component.css'
})
export class UsersPageComponent implements OnInit {

  private userService = inject(UserService);
  private loginUserService = inject(LoginUserService);

  users: User[] = [];
  isLoading = false;

  roles = USER_ROLES;

  selectedUser: User | null = null;
  isEditMode = false;
  showUserModal = false;
  showPasswordModal = false;
  showDeleteConfirm = false;
  userToDelete: User | null = null;
  isSaving = false;

  userForm = new FormGroup({
    numberIdentity: new FormControl('', Validators.required),
    name: new FormControl('', Validators.required),
    surname: new FormControl('', Validators.required),
    phone: new FormControl(''),
    address: new FormControl(''),
    rol: new FormControl('VENDEDOR', Validators.required),
    password: new FormControl(''),
  });

  passwordForm = new FormGroup({
    newPassword: new FormControl('', [Validators.required, Validators.minLength(6)]),
    confirmPassword: new FormControl('', Validators.required),
  });

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.isLoading = true;
    this.userService.getAll().subscribe({
      next: (users) => {
        this.users = users;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error al cargar los usuarios', error.error);
        toast.error('Error al cargar los usuarios');
        this.isLoading = false;
      },
    });
  }

  openCreate(): void {
    this.isEditMode = false;
    this.selectedUser = null;
    this.userForm.reset({ rol: 'VENDEDOR' });
    this.userForm.get('numberIdentity')!.enable();
    this.userForm.get('password')!.setValidators([Validators.required, Validators.minLength(6)]);
    this.userForm.get('password')!.updateValueAndValidity();
    this.showUserModal = true;
  }

  openEdit(user: User): void {
    this.isEditMode = true;
    this.selectedUser = user;
    this.userForm.patchValue({
      numberIdentity: user.numberIdentity,
      name: user.name,
      surname: user.surname,
      phone: user.phone,
      address: user.address,
      rol: user.rol,
    });
    this.userForm.get('numberIdentity')!.disable();
    this.userForm.get('password')!.clearValidators();
    this.userForm.get('password')!.updateValueAndValidity();
    this.showUserModal = true;
  }

  saveUser(): void {
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }
    this.isSaving = true;
    const v = this.userForm.getRawValue();

    if (this.isEditMode && this.selectedUser) {
      const req: UpdateUserRequest = {
        name: v.name!,
        surname: v.surname!,
        phone: v.phone || '',
        address: v.address || '',
        rol: v.rol!,
      };
      this.userService.update(this.selectedUser.id, req).subscribe({
        next: (updated) => {
          const idx = this.users.findIndex(u => u.id === updated.id);
          if (idx >= 0) this.users[idx] = updated;
          toast.success('Usuario actualizado');
          this.showUserModal = false;
          this.isSaving = false;
        },
        error: () => { toast.error('Error al actualizar usuario'); this.isSaving = false; },
      });
    } else {
      const req: CreateUserRequest = {
        numberIdentity: v.numberIdentity!,
        password: v.password!,
        name: v.name!,
        surname: v.surname!,
        phone: v.phone || '',
        address: v.address || '',
        rol: v.rol!,
      };
      this.userService.create(req).subscribe({
        next: (created) => {
          this.users.push(created);
          toast.success('Usuario creado');
          this.showUserModal = false;
          this.isSaving = false;
        },
        error: () => { toast.error('Error al crear usuario'); this.isSaving = false; },
      });
    }
  }

  openChangePassword(user: User): void {
    this.selectedUser = user;
    this.passwordForm.reset();
    this.showPasswordModal = true;
  }

  savePassword(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    const { newPassword, confirmPassword } = this.passwordForm.value;
    if (newPassword !== confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }
    this.isSaving = true;
    const req: ChangePasswordRequest = { newPassword: newPassword! };
    this.userService.changePassword(this.selectedUser!.id, req).subscribe({
      next: () => {
        toast.success('Contraseña actualizada');
        this.showPasswordModal = false;
        this.isSaving = false;
      },
      error: () => { toast.error('Error al cambiar contraseña'); this.isSaving = false; },
    });
  }

  confirmDelete(user: User): void {
    this.userToDelete = user;
    this.showDeleteConfirm = true;
  }

  deleteUser(): void {
    if (!this.userToDelete) return;
    this.userService.delete(this.userToDelete.id).subscribe({
      next: () => {
        this.users = this.users.filter(u => u.id !== this.userToDelete!.id);
        toast.success('Usuario eliminado');
        this.showDeleteConfirm = false;
        this.userToDelete = null;
      },
      error: () => toast.error('Error al eliminar usuario'),
    });
  }

  roleBadgeClass(rol: string): string {
    switch (rol) {
      case 'ADMIN': return 'badge bg-danger';
      case 'FACTURADOR': return 'badge bg-primary';
      case 'VENDEDOR': return 'badge bg-success';
      default: return 'badge bg-secondary';
    }
  }

  get currentUser() {
    return this.loginUserService.getUserFromToken();
  }
}
