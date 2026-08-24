import { Component, input } from "@angular/core";

@Component({
  selector: "app-sidebar-panel",
  standalone: true,
  template: `
    <div class="sidebar-panel">
      @if (title()) {
        <div class="panel-header">
          <h3>{{ title() }}</h3>
          <div class="panel-actions">
            <ng-content select="[actions]"></ng-content>
          </div>
        </div>
      }
      <div class="panel-body">
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex: 1 1 0;
      min-height: 0;
    }

    .sidebar-panel {
      display: flex;
      flex-direction: column;
      flex: 1 1 0;
      min-height: 0;
      border: 1px solid var(--p-content-border-color, #334155);
      border-radius: 0.5rem;
      padding: 0.75rem;
      background: var(--p-content-background, #18181b);
      overflow: hidden;
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .panel-header h3 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
    }

    .panel-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .panel-body {
      flex: 1 1 0;
      min-height: 0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
  `,
})
export class SidebarPanelComponent {
  title = input<string | undefined>();
}
