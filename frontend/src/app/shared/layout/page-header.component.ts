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
      gap: var(--spacing-16, 16px);
      padding: var(--spacing-16, 16px) var(--spacing-16, 16px) var(--spacing-12, 12px);
    }

    h2 {
      margin: 0;
      font-size: var(--text-heading, 24px);
      line-height: 1.2;
      font-weight: 700;
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
