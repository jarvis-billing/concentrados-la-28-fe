import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ModalSaleDetailComponent } from './modal-sale-detail.component';

describe('ModalSaleDetailComponent', () => {
  let component: ModalSaleDetailComponent;
  let fixture: ComponentFixture<ModalSaleDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModalSaleDetailComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ModalSaleDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
