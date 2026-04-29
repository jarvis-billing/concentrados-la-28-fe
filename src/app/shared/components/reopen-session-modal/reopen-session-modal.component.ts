import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-reopen-session-modal',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './reopen-session-modal.component.html'
})
export class ReopenSessionModalComponent {

    @Input() isOpen: boolean = false;
    @Input() sessionLabel: string = 'sesión';
    @Input() isProcessing: boolean = false;
    @Output() closed = new EventEmitter<void>();
    @Output() confirmed = new EventEmitter<string>();

    reason: string = '';

    get canConfirm(): boolean {
        return this.reason.trim().length > 0 && !this.isProcessing;
    }

    onConfirm(): void {
        if (!this.canConfirm) return;
        this.confirmed.emit(this.reason.trim());
    }

    close(): void {
        this.reason = '';
        this.closed.emit();
    }
}
