import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProductsSearchModalComponent } from './products-search-modal.component';

describe('ProductsSearchModalComponent', () => {
  let component: ProductsSearchModalComponent;
  let fixture: ComponentFixture<ProductsSearchModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductsSearchModalComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ProductsSearchModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
