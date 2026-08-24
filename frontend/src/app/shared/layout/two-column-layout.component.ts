import { Component, input } from "@angular/core";

@Component({
  selector: "app-two-column-layout",
  standalone: true,
  template: `
    <div class="two-column-layout">
      <aside [style.width]="sidebarWidth()" [style.minWidth]="sidebarWidth()">
        <ng-content select="[sidebar]"></ng-content>
      </aside>
      <main>
        <ng-content select="[main]"></ng-content>
      </main>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex: 1 1 0;
      min-height: 0;
    }

    .two-column-layout {
      display: flex;
      flex: 1 1 0;
      min-height: 0;
      gap: 1rem;
      overflow: hidden;
    }

    aside {
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow-y: auto;
    }

    main {
      flex: 1 1 0;
      min-width: 0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }
  `,
})
export class TwoColumnLayoutComponent {
  sidebarWidth = input<string>("16rem");
}
