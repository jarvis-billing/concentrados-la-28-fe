import { Component, EventEmitter, inject, OnInit, Output } from '@angular/core';
import { ClienteService } from '../../cliente.service';
import { Client } from '../../cliente';
import { toast } from 'ngx-sonner';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'app-modal-clients-list',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './modal-clients-list.component.html',
  styleUrl: './modal-clients-list.component.css'
})
export class ModalClientsListComponent implements OnInit {

  @Output() clientSelected = new EventEmitter<Client>();

  ngOnInit(): void {
    this.getClients();
  }

  clientService = inject(ClienteService);

  originalListClients: Client[] = [];
  filteredListClients: Client[] = [];
  client!: Client;

  getClients() {
    this.clientService.getAll().subscribe({
      next: res => {
        this.originalListClients = res;
        this.filteredListClients = [...this.originalListClients];
      },
      error: error => {
        if (error.error) {
          toast.error(error.error);
        } else {
          toast.error('Ocurrió un error al buscar los clientes');
        }
      }
    });
  }

  formClient = new FormGroup({
    searchClient: new FormControl('')
  });

  searchClient() {
    const searchClient = this.formClient.controls.searchClient.value ?? '';
    if (searchClient) {
      this.filteredListClients = this.originalListClients.filter(client =>
        client.idNumber.toLowerCase().includes(searchClient) ||
        client.name.toLowerCase().includes(searchClient) ||
        client.surname.toLowerCase().includes(searchClient)
      );
    } else {
      this.filteredListClients = [...this.originalListClients];
    }

    if (this.filteredListClients.length === 0) {
      toast.info('No se encontró ningún cliente con ese criterio');
    }
  }

  clearClientSearchField() {
    this.formClient.reset();
    this.filteredListClients = [...this.originalListClients];
  }

  // Handle selected client
  selectClient(client: Client) {
    this.clientSelected.emit(client);
  }

}
