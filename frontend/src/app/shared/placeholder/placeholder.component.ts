import { Component, inject } from "@angular/core";
import { ActivatedRoute } from "@angular/router";

@Component({
  selector: "app-placeholder",
  standalone: true,
  template: `
    <div class="placeholder">
      <i class="pi pi-wrench" style="font-size: 2rem"></i>
      <h2>{{ title }}</h2>
      <p>Este módulo se implementará en una fase posterior.</p>
    </div>
  `,
  styles: `
    .placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      opacity: 0.6;
      gap: 0.5rem;
    }
  `,
})
export class PlaceholderComponent {
  title = inject(ActivatedRoute).snapshot.data["title"] ?? "En construcción";
}
