import { Component, input } from "@angular/core";

@Component({
  selector: "app-empty-state",
  standalone: true,
  template: `
    <div class="empty-state">
      @if (icon()) {
        <i [class]="'pi ' + icon()"></i>
      }
      <p>{{ message() }}</p>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex: 1 1 0;
      min-height: 0;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 2rem;
      text-align: center;
      opacity: 0.6;
      height: 100%;
    }

    i {
      font-size: 2rem;
    }

    p {
      margin: 0;
    }
  `,
})
export class EmptyStateComponent {
  icon = input<string | undefined>();
  message = input.required<string>();
}
