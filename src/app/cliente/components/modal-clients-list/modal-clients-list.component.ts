import { Component, ElementRef, EventEmitter, HostListener, inject, OnInit, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ClienteService } from '../../cliente.service';
import { Client, EClient, EDocument, SearchCriteriaClient } from '../../cliente';
import { toast } from 'ngx-sonner';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

@Component({
  selector: 'app-modal-clients-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './modal-clients-list.component.html',
  styleUrl: './modal-clients-list.component.css'
})
export class ModalClientsListComponent implements OnInit {

  @Output() clientSelected = new EventEmitter<Client>();

  @ViewChild('clientModal', { static: false }) clientModalRef!: ElementRef;

  ngOnInit(): void {
    this.getClients();
  }

  clientService = inject(ClienteService);
  fb = inject(FormBuilder);

  originalListClients: Client[] = [];
  filteredListClients: Client[] = [];
  client!: Client;
  editMode: boolean = false;
  selectedClientId: string | null = null;

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

  clientForm: FormGroup = this.fb.group({
    id: [''],
    idNumber: ['', [Validators.required, Validators.maxLength(20)]],
    documentType: [EDocument.CEDULA_CIUDADANIA, [Validators.required]],
    name: [''],
    surname: [''],
    businessName: [''],
    nickname: [''],
    address: [''],
    phone: [''],
    email: ['', [Validators.email]],
    clientType: [EClient.NATURAL, [Validators.required]],
    autoReportBilling: [true],
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

  loadByDocument() {
    const idNumber = (this.clientForm.value.idNumber || '').toString().trim();
    const documentType = (this.clientForm.value.documentType || EDocument.CEDULA_CIUDADANIA) as string;
    if (!idNumber) {
      toast.warning('Ingrese un número de documento para buscar.');
      return;
    }
    const criteria: SearchCriteriaClient = { idNumber, documentType } as any;
    this.clientService.findByDocument(criteria).subscribe({
      next: c => {
        if (c) {
          this.clientForm.patchValue({
            ...c,
            clientType: c.clientType || EClient.NATURAL,
            documentType: c.documentType || EDocument.CEDULA_CIUDADANIA
          });
          toast.info('Cliente encontrado y cargado para edición.');
        } else {
          toast.info('No se encontró cliente. Complete los datos para registrarlo.');
        }
      },
      error: () => toast.info('No se encontró cliente. Complete los datos para registrarlo.')
    });
  }

  saveClient() {
    if (this.clientForm.invalid) {
      this.clientForm.markAllAsTouched();
      toast.warning('Complete los campos obligatorios del cliente.');
      return;
    }
    const payload: Client = { ...new Client(), ...this.clientForm.value } as Client;
    this.clientService.create(payload).subscribe({
      next: saved => {
        toast.success('Cliente registrado correctamente');
        this.selectClient(saved);
        this.getClients();
      },
      error: (err) => {
        toast.error(err?.error || 'Error registrando el cliente');
      }
    });
  }

  updateClient() {
    if (this.clientForm.invalid) {
      this.clientForm.markAllAsTouched();
      toast.warning('Complete los campos obligatorios del cliente.');
      return;
    }
    const payload: Client = { ...new Client(), ...this.clientForm.value } as Client;
    this.clientService.update(payload).subscribe({
      next: updated => {
        toast.success('Cliente actualizado correctamente');
        this.selectClient(updated);
        this.getClients();
      },
      error: (err) => {
        toast.error(err?.error || 'Error actualizando el cliente');
      }
    });
  }

  onRowClick(client: Client) {
    // Cargar datos al formulario para edición sin cerrar el modal
    this.editMode = true;
    this.selectedClientId = client.id || null;
    this.clientForm.patchValue({
      ...client,
      documentType: client.documentType || EDocument.CEDULA_CIUDADANIA,
      clientType: client.clientType || EClient.NATURAL,
    });
  }

  cancelEdit() {
    this.editMode = false;
    this.selectedClientId = null;
    this.clientForm.reset({
      id: '',
      idNumber: '',
      documentType: EDocument.CEDULA_CIUDADANIA,
      name: '',
      surname: '',
      businessName: '',
      nickname: '',
      address: '',
      phone: '',
      email: '',
      clientType: EClient.NATURAL,
      autoReportBilling: true,
    });
    this.clientForm.markAsPristine();
    this.clientForm.markAsUntouched();
  }

  private isModalOpen(): boolean {
    const el = this.clientModalRef?.nativeElement as HTMLElement | undefined;
    return !!el && el.classList.contains('show');
  }

  @HostListener('document:keydown', ['$event'])
  handleKeys(e: KeyboardEvent) {
    if (!this.isModalOpen()) return;
    // Evitar atajos cuando el foco está escribiendo en algún control
    const target = e.target as HTMLElement | null;
    const tag = (target?.tagName || '').toLowerCase();
    const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || (target?.isContentEditable ?? false);
    if (isTyping) return;

    // Atajos de una sola tecla: S=Guardar, U=Actualizar, Esc=Cancelar
    if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      if (!this.editMode) this.saveClient();
      return;
    }
    if (e.key === 'u' || e.key === 'U') {
      e.preventDefault();
      if (this.editMode) this.updateClient();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this.cancelEdit();
      return;
    }
  }

  // Handle selected client
  selectClient(client: Client) {
    this.clientSelected.emit(client);
    this.closeModal();
  }

  openModal() {
    const modalEl = this.clientModalRef?.nativeElement;
    if (modalEl) {
      // Resetear el formulario de cliente al abrir el modal
      try {
        this.clientForm.reset({
          id: '',
          idNumber: '',
          documentType: EDocument.CEDULA_CIUDADANIA,
          name: '',
          surname: '',
          businessName: '',
          nickname: '',
          address: '',
          phone: '',
          email: '',
          clientType: EClient.NATURAL,
          autoReportBilling: true,
        });
        this.clientForm.markAsPristine();
        this.clientForm.markAsUntouched();
      } catch { /* noop */ }
      const modal = new (window as any).bootstrap.Modal(modalEl);
      modal.show();
    }
  }

  closeModal() {
    const modalEl = this.clientModalRef?.nativeElement as HTMLElement | undefined;
    if (!modalEl) return;

    const bs = (window as any).bootstrap;
    try {
      if (bs?.Modal) {
        const instance = bs.Modal.getInstance(modalEl) || bs.Modal.getOrCreateInstance(modalEl);
        instance?.hide();
        return;
      }
    } catch { /* noop */ }

    // Fallback manual si no hay instancia de Bootstrap
    try {
      modalEl.classList.remove('show');
      modalEl.style.display = 'none';
      modalEl.setAttribute('aria-hidden', 'true');
      modalEl.removeAttribute('aria-modal');
      document.body.classList.remove('modal-open');
      // Eliminar backdrop si quedó presente
      const backdrops = document.querySelectorAll('.modal-backdrop');
      backdrops.forEach(el => el.remove());
    } catch { /* noop */ }
  }

}
