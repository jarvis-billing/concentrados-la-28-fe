import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ModalUsersListComponent } from './modal-users-list.component';

describe('ModalUsersListComponent', () => {
  let component: ModalUsersListComponent;
  let fixture: ComponentFixture<ModalUsersListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModalUsersListComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ModalUsersListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
