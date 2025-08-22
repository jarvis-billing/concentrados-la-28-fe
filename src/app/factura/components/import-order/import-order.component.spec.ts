import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ImportOrderComponent } from './import-order.component';

describe('ImportOrderComponent', () => {
  let component: ImportOrderComponent;
  let fixture: ComponentFixture<ImportOrderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ImportOrderComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ImportOrderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
