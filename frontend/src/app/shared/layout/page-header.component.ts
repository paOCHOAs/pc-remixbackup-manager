import { Component, input } from "@angular/core";

@Component({
  selector: "app-page-header",
  standalone: true,
  template: `
    <header class="page-header">
      <h2>{{ title() }}</h2>
      <div class="actions">
        <ng-content select="[actions]"></ng-content>
      </div>
    </header>
  `,
  styles: `
    :host {
      display: block;
    }

    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--p-content-border-color, #334155);
    }

    h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 600;
    }

    .actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
  `,
})
export class PageHeaderComponent {
  title = input.required<string>();
}
