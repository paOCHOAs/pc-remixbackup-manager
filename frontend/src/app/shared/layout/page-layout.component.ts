import { Component } from "@angular/core";

@Component({
  selector: "app-page-layout",
  standalone: true,
  template: `
    <ng-content select="app-page-header"></ng-content>
    <div class="page-content">
      <ng-content></ng-content>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .page-content {
      flex: 1 1 0;
      min-height: 0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      padding: 0 1rem 1rem;
    }
  `,
})
export class PageLayoutComponent {}
