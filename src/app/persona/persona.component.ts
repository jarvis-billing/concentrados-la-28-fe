import { Component, OnInit } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Persona } from './persona';
import { PersonaService } from './persona.service';
import { toast } from 'ngx-sonner';

@Component({
  selector: 'app-persona',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './persona.component.html',
  styleUrl: './persona.component.css'
})
export class PersonaComponent implements OnInit {
  persona : Persona = new Persona();
  lstPersona : Persona[] = [];

  constructor(private service : PersonaService) { }

  ngOnInit(): void {
    this.getAll();
    
  }

  getAll(): void {
    this.service.getAll().subscribe({
      next: res => this.lstPersona = res
    });
  }

  onSubmitPersona(formulario: NgForm) { 
    if (formulario.invalid) {
      toast.error('El formulario es inválido');
    } else {
      this.service.create(this.persona).subscribe({
        next: () => {
          this.getAll();
          this.persona = new Persona();
          formulario.resetForm();
          toast.success('Registro guardado correctamente');
        },
        error: error => {
          if (error.error) {
            toast.error(error.error.message);
          } else {
            toast.error('Ocurrió un error al crear el registro');
          }
        }
      });
    }
  }
}
