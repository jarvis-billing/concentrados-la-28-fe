import { Component, ViewChild, AfterViewInit } from '@angular/core';
import { ModalClientsListComponent } from './components/modal-clients-list/modal-clients-list.component';

@Component({
  selector: 'app-cliente',
  standalone: true,
  imports: [ModalClientsListComponent],
  templateUrl: './cliente.component.html',
  styleUrl: './cliente.component.css'
})
export class ClienteComponent implements AfterViewInit {

  @ViewChild(ModalClientsListComponent) clientModal!: ModalClientsListComponent;

  ngAfterViewInit(): void {
    setTimeout(() => this.clientModal?.openModal(), 300);
  }

  openClientModal(): void {
    this.clientModal?.openModal();
  }
}
