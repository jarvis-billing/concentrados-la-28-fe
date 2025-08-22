import { Component, EventEmitter, inject, OnInit, Output } from '@angular/core';
import { UserService } from '../../user.service';
import { User } from '../../../auth/user';
import { toast } from 'ngx-sonner';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'app-modal-users-list',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './modal-users-list.component.html',
  styleUrl: './modal-users-list.component.css'
})
export class ModalUsersListComponent implements OnInit {

  @Output() userSelected = new EventEmitter<User>();

  users: User[] = [];
  userService = inject(UserService);

  ngOnInit(): void {
    this.getAll();
  }

  
  formUser = new FormGroup({
    searchUser: new FormControl(''),
  });

  searchUser() {

  }

  clearUserSearchField() {

  }

  selectUser(user: User) {
    console.log('user selected: ', user)  
    this.userSelected.emit(user);
  }

  getAll() {
    return this.userService.getAll().subscribe({
      next: res => {
        console.log('response: ', res);
        this.users = res;
      },
      error: error => {
        if (error.error) {
          toast.error(error.error);
        } else {
          toast.error('Ocurrió un error al buscar los usuarios.');
        }
      }
    });
  }
}
