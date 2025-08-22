import { Inject, Injectable, InjectionToken } from '@angular/core';
export const BROWSER_STORAGE = new InjectionToken<Storage>('Browser Storage', {
    providedIn: 'root',
    factory: () => localStorage
});
@Injectable({
    providedIn: 'root'
})
export class StorageService {

    constructor(@Inject(BROWSER_STORAGE) public storage: Storage) { }
    
    get(key: string) {
        return this.storage.getItem(key);
    }
    
    set(key: string, value: any) {
        this.storage.setItem(key, value);
    }

    allClearItems() {
        this.storage.clear();
    }
}