export class PaginationDto<T> {
    pageSize: number = 0;
    quantityPage: number = 0;
    totalElements: number = 0;
    page: number = 0;
    content: T[] = [];
  }