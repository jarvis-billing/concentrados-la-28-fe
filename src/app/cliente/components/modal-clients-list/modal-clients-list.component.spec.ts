import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ModalClientsListComponent } from './modal-clients-list.component';

describe('ModalClientsListComponent', () => {
  let component: ModalClientsListComponent;
  let fixture: ComponentFixture<ModalClientsListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModalClientsListComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ModalClientsListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
